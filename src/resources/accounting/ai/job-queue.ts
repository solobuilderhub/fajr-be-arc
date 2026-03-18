/**
 * General-Purpose Job Queue
 *
 * In-memory async job queue with timeout handling and stuck job cleanup.
 * Processes jobs sequentially via registered handlers.
 */

import EventEmitter from 'events';
import Job from './job.model.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface QueuedJob {
  jobId: string;
  type: string;
  data: Record<string, any>;
  cleanup?: () => Promise<void>;
}

type JobHandler = (job: QueuedJob) => Promise<any>;

class GeneralJobQueue extends EventEmitter {
  private queue: QueuedJob[] = [];
  private running = false;
  private jobHandlers = new Map<string, JobHandler>();
  private activeJobs = new Map<string, { type: string; startedAt: Date; timeoutAt: Date }>();

  constructor() {
    super();
    this.on('process', () => this.processNext());
    this.startStuckJobCleanup();
  }

  registerHandler(jobType: string, handler: JobHandler): void {
    this.jobHandlers.set(jobType, handler);
  }

  add(job: QueuedJob): void {
    this.cleanupStuckJobsSync();
    this.queue.push(job);
    if (!this.running) {
      this.emit('process');
    }
  }

  private cleanupStuckJobsSync(): void {
    const now = new Date();
    const stuckIds: string[] = [];
    for (const [jobId, active] of this.activeJobs.entries()) {
      if (now > active.timeoutAt) stuckIds.push(jobId);
    }
    if (stuckIds.length > 0) {
      this.cleanupStuckJobs(stuckIds).catch(() => {});
    }
  }

  private async cleanupStuckJobs(jobIds: string[]): Promise<void> {
    for (const jobId of jobIds) {
      const active = this.activeJobs.get(jobId);
      if (!active) continue;
      this.activeJobs.delete(jobId);
      try {
        await Job.findByIdAndUpdate(jobId, {
          status: 'failed',
          error: 'Job timed out and was cleaned up',
        });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.running = false;
      return;
    }

    this.running = true;
    const job = this.queue[0]!;
    const startedAt = new Date();
    const timeoutAt = new Date(startedAt.getTime() + DEFAULT_TIMEOUT_MS);

    try {
      await Job.findByIdAndUpdate(job.jobId, { status: 'processing', startedAt });

      this.activeJobs.set(job.jobId, { type: job.type, startedAt, timeoutAt });

      const handler = this.jobHandlers.get(job.type);
      if (!handler) throw new Error(`No handler for job type: ${job.type}`);

      await Promise.race([
        handler(job),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Job execution timeout')), DEFAULT_TIMEOUT_MS),
        ),
      ]);

      await Job.findByIdAndUpdate(job.jobId, { status: 'completed', completedAt: new Date() });
    } catch (err: any) {
      await Job.findByIdAndUpdate(job.jobId, { status: 'failed', error: err.message });
    } finally {
      this.activeJobs.delete(job.jobId);
      if (job.cleanup) await job.cleanup().catch(() => {});
      this.queue.shift();
      this.emit('process');
    }
  }

  private startStuckJobCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const stuckIds: string[] = [];
      for (const [jobId, active] of this.activeJobs.entries()) {
        if (now > active.timeoutAt) stuckIds.push(jobId);
      }
      if (stuckIds.length > 0) {
        this.cleanupStuckJobs(stuckIds).then(() => this.emit('process'));
      }
    }, CLEANUP_INTERVAL_MS);
  }
}

export const jobQueue = new GeneralJobQueue();
export default jobQueue;
