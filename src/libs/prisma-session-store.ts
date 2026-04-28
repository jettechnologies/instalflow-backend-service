import { Store } from "express-session";
import { prisma } from "@/prisma/client.js";

export default class PrismaSessionStore extends Store {
  private ttl: number;

  constructor(ttl: number = 86400) {
    super();
    this.ttl = ttl; // seconds (default 1 day)
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const record = await prisma.session.findUnique({
        where: { id: sid },
      });

      if (!record || record.expiresAt < new Date()) {
        return callback(null, null);
      }

      return callback(null, record.data);
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid: string, session: any, callback?: (err?: any) => void) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl * 1000);

      await prisma.session.upsert({
        where: { id: sid },
        update: { data: session, expiresAt },
        create: { id: sid, data: session, expiresAt },
      });

      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      await prisma.session.delete({ where: { id: sid } });
      if (callback) callback();
    } catch (err) {
      if (callback) callback(err);
    }
  }
}
