type EventMap = {
  'engine-stall': void;
  'engine-restart': void;
  'water-enter': { x: number; y: number; speed: number };
  'water-exit': void;
  'hook-fire': { x: number; y: number; angle: number };
  'hook-attach': { x: number; y: number };
  'hook-miss': void;
  'rope-snap': { x: number; y: number };
  'crate-hit': { crateIndex: number; damage: number };
  'cargo-lost': { crateIndex: number };
  'flooded': void;
  'level-complete': { stars: number; payout: number; timeSec: number };
  'level-failed': { reason: string };
  'depot-service': { x: number };
};

type EventCallback<K extends keyof EventMap> = (data: EventMap[K]) => void;

export class EventBus {
  private listeners: { [K in keyof EventMap]?: Array<EventCallback<K>> } = {};

  public on<K extends keyof EventMap>(event: K, cb: EventCallback<K>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(cb);
    return () => this.off(event, cb);
  }

  public off<K extends keyof EventMap>(event: K, cb: EventCallback<K>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = (list as Array<EventCallback<K>>).filter((fn) => fn !== cb) as any;
    }
  }

  public emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) {
      for (let i = 0; i < list.length; i++) {
        list[i](data);
      }
    }
  }

  public clear(): void {
    this.listeners = {};
  }
}

export const eventBus = new EventBus();
