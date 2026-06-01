import {
  JobsOptions as BullJobsOptions,
  Job,
  MetricsTime,
  Queue,
  Worker,
} from "bullmq";
import { mapTo, toInstance, toPlain } from "core-kit/packages/transform";
import { minutesToMilliseconds, secondsToMilliseconds } from "date-fns";
import merge from "lodash/merge";
import { Logger } from "pino";
import { createLogger } from "../logger/utils";
import sentry from "../sentry";
import { JobsQueueOptions as QueueOptions } from "./consts";
import connection from "./redis";

export type JobsOptions = BullJobsOptions;

export class JobsQueue<T> {
  private logger: Logger = createLogger(this.id);

  private bull: Queue;
  private options: QueueOptions;
  private workers: Worker[] = [];

  constructor(
    private id: string,
    private model: new (defs?: Partial<T>) => T,
    options: QueueOptions = {},
  ) {
    this.options = merge(
      {
        concurrency: 1,
        timeout: minutesToMilliseconds(5),
        limiter: {
          max: 5,
          duration: secondsToMilliseconds(10),
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: "fixed",
            delay: secondsToMilliseconds(5),
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      },
      options,
    );
    const { defaultJobOptions } = this.options;
    this.bull = new Queue(id, { connection, defaultJobOptions });
  }

  async getJobState(id: string) {
    return this.bull.getJobState(id);
  }

  async getState(): Promise<{
    active: number;
    delayed: number;
    waiting: number;
    planned: number;
    completed: number;
    failed: number;
  }> {
    const { active, delayed, waiting, completed, failed } =
      await this.bull.getJobCounts();
    return {
      active,
      delayed,
      waiting,
      planned: active + delayed + waiting,
      completed,
      failed,
    };
  }

  async plan(data: Partial<T> = {}, options: JobsOptions = {}) {
    const { timeout } = this.options;
    this.logger.debug(
      `Plan new task ${this.id} with ${timeout / 1000}s timeout`,
    );
    const payload = toPlain(mapTo(data, this.model));
    this.logger.debug(JSON.stringify(payload));
    return await this.bull.add("default", payload, merge({ timeout }, options));
  }

  async close() {
    this.logger.debug("Closing queue workers");
    await Promise.all(this.workers.map((w) => w.close()));
    this.logger.debug("Workers are closed");
    this.logger.debug("Closing queue");
    await this.bull.close();
    this.logger.debug("Queue is closed");
  }

  async obliterate() {
    await this.bull.obliterate();
  }

  async metrics(): Promise<string> {
    return this.bull.exportPrometheusMetrics();
  }

  process(
    handler: (payload: T, job?: Job) => Promise<any>,
    error?: (payload: T, err?: Error, job?: Job) => Promise<void>,
  ) {
    this.logger.debug("Run queue worker");
    const { concurrency, limiter } = this.options;
    const worker = new Worker(
      this.id,
      async (job: Job) => {
        this.logger.debug(`Process job ${job.id}`);
        try {
          const { data } = job;
          return await handler(toInstance(data, this.model), job);
        } catch (err) {
          this.logger.error(err);
          throw err;
        }
      },
      {
        connection,
        concurrency,
        limiter,
        metrics: {
          maxDataPoints: MetricsTime.ONE_HOUR,
        },
      },
    );
    worker.on("failed", async (job, err) => {
      sentry.captureException(err);
      this.logger.error(`Job failed [${job.attemptsMade}]`);
      this.logger.error(err);
      if (!!error) {
        const { data } = job;
        await error(toInstance(data, this.model), err, job);
      }
    });

    this.workers.push(worker);
  }
}
