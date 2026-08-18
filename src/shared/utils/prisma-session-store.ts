import { Store, type SessionData } from "express-session";
import { prisma, type Prisma } from "@/infrastructure/prisma";

export default class PrismaSessionStore extends Store {
  private ttl: number;

  constructor(ttl: number = 86400) {
    super();
    this.ttl = ttl; // seconds (default 1 day)
  }

  async get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ) {
    try {
      const record = await prisma.session.findUnique({
        where: { id: sid },
      });

      if (!record || record.expiresAt < new Date()) {
        return callback(null, null);
      }

      return callback(null, record.data as SessionData | null);
    } catch (err) {
      return callback(err);
    }
  }

  async set(
    sid: string,
    session: SessionData,
    callback?: (err?: unknown) => void,
  ) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);

      const data = {
        session: session as unknown as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue;

      await prisma.session.upsert({
        where: { id: sid },
        update: { data, expiresAt },
        create: {
          id: sid,
          data,
          expiresAt,
        },
      });

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: unknown) => void) {
    try {
      await prisma.session.delete({ where: { id: sid } });
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }
}
