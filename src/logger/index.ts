import "dotenv/config"

import { pino } from "pino"

export const logger = pino(
  process.env.LOG_JSON === "1"
    ? {
        level: process.env.LOG_LEVEL || "debug",
        formatters: {
          level: (label) => {
            return {
              [process.env.LOG_LEVEL_KEY || "level"]: label,
            }
          },
        },
        messageKey: process.env.LOG_MSG_KEY || "message",
      }
    : {
        transport: {
          target: "pino-pretty",
        },
        level: process.env.LOG_LEVEL || "debug",
      }
)
