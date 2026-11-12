export class ObservableStore<T extends object> {
  protected disposed = false;
  private listeners = new Set<() => void>();

  constructor(protected state: T) {}

  getSnapshot = (): T => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  protected update(patch: Partial<T>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
