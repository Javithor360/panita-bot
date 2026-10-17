import type { BridgeLink } from './link';

export interface CrashWatchDeps {
  link: Pick<BridgeLink, 'onFrame' | 'onConnection'>;
  /** Seconds without the server before it counts as crashed. */
  graceSeconds: number;
  /** The server reported that it started. */
  onStarted(): Promise<void> | void;
  /** The server reported that it is stopping, which is not a crash. */
  onStopping(): Promise<void> | void;
  /** The server is gone and never said it was stopping. Called once per crash. */
  onCrash(): Promise<void> | void;
  logger: Pick<Console, 'error'>;
  /** Runs `run` after `ms`; gives a function that cancels it. */
  schedule?: (run: () => void, ms: number) => () => void;
}

const inTime = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

/**
 * Tells a crash from a stop. The server announces that it is stopping before it closes the line, so a line that is lost without
 * that is a crash, but only when it does not come back within `graceSeconds` (a blip of the network is not a crash). A server that
 * comes back as a new run, with another `startedAt`, without ever having said it was stopping, crashed and restarted inside that time.
 * Nothing is remembered across a restart of the bot, on purpose: a server that kept running through it did not crash.
 */
export const watchForCrashes = (deps: CrashWatchDeps): void => {
  const schedule = deps.schedule ?? inTime;
  let startedAt: string | null = null;
  let stopped = false;
  let reported = false;
  let cancel: (() => void) | null = null;

  const run = (what: () => Promise<void> | void) => {
    Promise.resolve()
      .then(what)
      .catch(error => deps.logger.error('[Minecraft] Could not handle a change of the server:', error));
  };

  const crashed = () => {
    cancel = null;
    if (reported) return;
    reported = true;
    run(deps.onCrash);
  };

  deps.link.onFrame(frame => {
    if (frame.type !== 'event') return;
    if (frame.kind === 'stopping') {
      stopped = true;
      run(deps.onStopping);
    } else if (frame.kind === 'started') {
      run(deps.onStarted);
    }
  });

  deps.link.onConnection(event => {
    if (event.type === 'disconnected') {
      if (stopped || reported || cancel) return;
      cancel = schedule(crashed, deps.graceSeconds * 1000);
      return;
    }
    cancel?.();
    cancel = null;
    const newRun = startedAt !== null && startedAt !== event.hello.startedAt;
    if (newRun && !stopped) crashed();
    if (newRun) stopped = false;
    // The server is back, so the next time it goes away without a word is a crash of its own
    reported = false;
    startedAt = event.hello.startedAt;
  });
};
