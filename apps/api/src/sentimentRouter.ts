import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from './db/supabase.js';
import { analyzeSentiment, type SentimentLabel } from './sentiment.js';

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
  userId: string;
  userName: string;
  isSuperadmin?: boolean;
}

interface StatsQuery {
  days?: string;
}

interface ConversationSentimentRow {
  id: string;
  summary: string | null;
  category: string | null;
  sentiment: SentimentLabel | null;
  sentiment_score: number | null;
  created_at: string;
  sentiment_at: string | null;
}

interface BucketCounts {
  positive: number;
  neutral: number;
  negative: number;
}

async function getSession(request: FastifyRequest): Promise<SessionCookie | null> {
  const sessionCookie = request.cookies.session;
  if (!sessionCookie) return null;

  try {
    const session = JSON.parse(sessionCookie) as Partial<SessionCookie>;
    if (!session.role) return null;

    const validRoles = new Set([
      'admin',
      'inbox',
      'conversations',
      'forms',
      'readonly',
      'superadmin',
    ]);
    if (!validRoles.has(session.role)) return null;
    if (session.role === 'superadmin' && session.isSuperadmin === true) {
      return {
        cityId: session.cityId ?? '',
        cityCode: session.cityCode ?? '',
        role: 'superadmin',
        userId: session.userId ?? '',
        userName: session.userName ?? '',
        isSuperadmin: true,
      };
    }
    if (!session.cityId || !session.cityCode || !session.userId || !session.userName) return null;
    return session as SessionCookie;
  } catch {
    return null;
  }
}

async function resolveCity(cityCode: string) {
  let { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id, code')
    .eq('slug', cityCode)
    .single();

  if (cityError || !city) {
    const derivedCode = cityCode.toUpperCase();
    const { data: cityByCode, error: codeError } = await supabase
      .from('cities')
      .select('id, code')
      .eq('code', derivedCode)
      .single();

    if (codeError || !cityByCode) return null;
    city = cityByCode;
  }

  return city;
}

function normalizeSentiment(sentiment: SentimentLabel | null): SentimentLabel {
  if (sentiment === 'positive' || sentiment === 'negative') return sentiment;
  return 'neutral';
}

function addToBucket(buckets: BucketCounts, label: SentimentLabel): void {
  if (label === 'positive') buckets.positive += 1;
  else if (label === 'negative') buckets.negative += 1;
  else buckets.neutral += 1;
}

function getWeekStart(input: Date): Date {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function formatWeekLabel(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

export async function registerSentimentRoutes(server: FastifyInstance) {
  server.post('/admin/sentiment/backfill', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.code(404).send({ error: 'City not found' });
    }
    if (session.cityId !== city.id) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, summary')
      .eq('city_id', city.id)
      .not('summary', 'is', null)
      .is('sentiment', null);

    if (error) {
      request.log.error({ err: error }, 'sentiment backfill query failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }

    const rows = conversations ?? [];
    let processed = 0;
    let failed = 0;
    const batchSize = 20;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          if (!row.summary) {
            throw new Error('Missing summary');
          }

          const sentiment = await analyzeSentiment(row.summary);
          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              sentiment: sentiment.sentiment,
              sentiment_score: sentiment.score,
              sentiment_at: new Date().toISOString(),
            })
            .eq('id', row.id)
            .eq('city_id', city.id)
            .is('sentiment', null);

          if (updateError) {
            throw updateError;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') processed += 1;
        else failed += 1;
      }
    }

    return reply.send({ processed, failed });
  });

  server.get(
    '/admin/sentiment/stats',
    async (
      request: FastifyRequest<{ Querystring: StatsQuery }>,
      reply: FastifyReply
    ) => {
      const session = await getSession(request);
      if (!session) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (session.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const city = await resolveCity(session.cityCode);
      if (!city) {
        return reply.code(404).send({ error: 'City not found' });
      }
      if (session.cityId !== city.id) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const parsedDays = Number.parseInt(request.query.days ?? '30', 10);
      const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;
      const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { data: rangeRows, error: rangeError } = await supabase
        .from('conversations')
        .select('id, category, sentiment, sentiment_score, created_at, sentiment_at')
        .eq('city_id', city.id)
        .gte('created_at', fromDate.toISOString());

      if (rangeError) {
        request.log.error({ err: rangeError }, 'sentiment stats range query failed');
        return reply.code(500).send({ error: 'Internal server error' });
      }

      const categoryMap = new Map<string, BucketCounts>();
      const overall: BucketCounts = { positive: 0, neutral: 0, negative: 0 };
      let scoreSum = 0;
      let scoreCount = 0;

      for (const row of (rangeRows ?? []) as ConversationSentimentRow[]) {
        const label = normalizeSentiment(row.sentiment);
        addToBucket(overall, label);

        const category = (row.category ?? 'Ostalo').trim() || 'Ostalo';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, { positive: 0, neutral: 0, negative: 0 });
        }
        addToBucket(categoryMap.get(category) as BucketCounts, label);

        if (typeof row.sentiment_score === 'number' && Number.isFinite(row.sentiment_score)) {
          scoreSum += row.sentiment_score;
          scoreCount += 1;
        }
      }

      const byCategory = Array.from(categoryMap.entries())
        .map(([category, bucket]) => ({
          category,
          positive: bucket.positive,
          neutral: bucket.neutral,
          negative: bucket.negative,
          total: bucket.positive + bucket.neutral + bucket.negative,
        }))
        .sort((a, b) => b.total - a.total);

      const trendStart = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
      const { data: trendRows, error: trendError } = await supabase
        .from('conversations')
        .select('id, sentiment, sentiment_score, created_at, sentiment_at')
        .eq('city_id', city.id)
        .gte('created_at', trendStart.toISOString());

      if (trendError) {
        request.log.error({ err: trendError }, 'sentiment trend query failed');
        return reply.code(500).send({ error: 'Internal server error' });
      }

      const trendMap = new Map<
        string,
        BucketCounts & { scoreSum: number; scoreCount: number }
      >();

      for (const row of (trendRows ?? []) as ConversationSentimentRow[]) {
        const pointDate = new Date(row.sentiment_at ?? row.created_at);
        const weekStart = getWeekStart(pointDate);
        const week = formatWeekLabel(weekStart);
        if (!trendMap.has(week)) {
          trendMap.set(week, {
            positive: 0,
            neutral: 0,
            negative: 0,
            scoreSum: 0,
            scoreCount: 0,
          });
        }

        const bucket = trendMap.get(week);
        if (!bucket) continue;

        const label = normalizeSentiment(row.sentiment);
        addToBucket(bucket, label);
        if (typeof row.sentiment_score === 'number' && Number.isFinite(row.sentiment_score)) {
          bucket.scoreSum += row.sentiment_score;
          bucket.scoreCount += 1;
        }
      }

      const weekStarts: Date[] = [];
      const thisWeek = getWeekStart(new Date());
      for (let i = 7; i >= 0; i -= 1) {
        const week = new Date(thisWeek);
        week.setUTCDate(thisWeek.getUTCDate() - i * 7);
        weekStarts.push(week);
      }

      const trend = weekStarts.map((weekStart) => {
        const week = formatWeekLabel(weekStart);
        const bucket = trendMap.get(week) ?? {
          positive: 0,
          neutral: 0,
          negative: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
        return {
          week,
          positive: bucket.positive,
          neutral: bucket.neutral,
          negative: bucket.negative,
          avgScore: bucket.scoreCount > 0 ? bucket.scoreSum / bucket.scoreCount : 0,
        };
      });

      return reply.send({
        byCategory,
        trend,
        overall: {
          positive: overall.positive,
          neutral: overall.neutral,
          negative: overall.negative,
          avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
        },
      });
    }
  );
}
