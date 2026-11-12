import { connect, createServer, type Server, type Socket } from 'node:net';

/**
 * A TCP relay in front of Postgres, so a test can stop the database for one app only.
 * Cutting it resets the open connections and refuses new ones, as a stopped server does;
 * restoring it listens again on the same port, so the app's pools reconnect on their own.
 */
export class DatabaseRelay {
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();

  private constructor(
    private readonly target: { host: string; port: number },
    private listeningPort = 0,
  ) {}

  static async start(target: {
    host: string;
    port: number;
  }): Promise<DatabaseRelay> {
    const relay = new DatabaseRelay(target);
    await relay.restore();
    return relay;
  }

  get port(): number {
    return this.listeningPort;
  }

  async restore(): Promise<void> {
    const server = createServer((client) => this.relay(client));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.listeningPort, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('the relay has no TCP port');
    this.listeningPort = address.port;
    this.server = server;
  }

  async cut(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private relay(client: Socket): void {
    const upstream = connect(this.target.port, this.target.host);
    this.sockets.add(client).add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      this.sockets.delete(client);
      this.sockets.delete(upstream);
    };
    client.on('error', drop).on('close', drop);
    upstream.on('error', drop).on('close', drop);
    client.pipe(upstream).pipe(client);
  }
}
