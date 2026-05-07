import { Redis } from "ioredis";

const HOST = process.env.REDIS_HOST!;
const PORT = process.env.REDIS_PORT! as unknown as number;
const USERNAME = process.env.REDIS_USERNAME!;
const PASSWORD = process.env.REDIS_PASSWORD!;

export const redis = new Redis({
  host: HOST,
  port: PORT,
  username: USERNAME,
  password: PASSWORD,
  maxRetriesPerRequest: null,
});

// import { Redis } from "ioredis";

// export const redis = new Redis(process.env.REDIS_URL!, {
//   maxRetriesPerRequest: null,
// });
