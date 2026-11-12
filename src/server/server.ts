// Tiny zero-dependency HTTP server: serves the dashboard, streams frames over SSE, takes commands.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { Simulation, VERSION, type SimOptions } from '../engine/engine.js';
import type { Scenario } from '../engine/plugins.js';
import type { Command, Frame, ReplayFile } from '../engine/types.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export interface LiveOptions {
  make: (seed: number | string) => Simulation;
  seed: number | string;
  scenario: Scenario;
  scenarios: Scenario[];
  tps: number;
  maxTicks?: number;
}

export interface ServerOptions {
  port: number;
  host?: string;
  webRoot: string;
  live?: LiveOptions;
  replay?: ReplayFile;
  log?: (msg: string) => void;
}

/** Runs a live world in the background at a target ticks-per-second. */
class LiveRunner {
  sim: Simulation;
  paused = false;
  tps: number;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private listeners = new Set<(event: string, data: unknown) => void>();
  seed: number | string;

  constructor(private o: LiveOptions, private log: (m: string) => void) {
    this.seed = o.seed;
    this.tps = o.tps;
    this.sim = o.make(o.seed);
  }

  on(fn: (event: string, data: unknown) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private send(event: string, data: unknown) {
    for (const fn of this.listeners) fn(event, data);
  }

  start() {
    const loop = async () => {
      const started = Date.now();
      if (!this.paused && !this.busy && !(this.o.maxTicks && this.sim.state.tick >= this.o.maxTicks)) {
        this.busy = true;
        try {
          const frame = await this.sim.tick();
          this.send('frame', frame);
        } catch (err) {
          this.log(`tick failed: ${(err as Error).message}`);
        } finally {
          this.busy = false;
        }
      }
      const wait = Math.max(5, 1000 / Math.max(0.2, this.tps) - (Date.now() - started));
      this.timer = setTimeout(loop, wait);
    };
    this.timer = setTimeout(loop, 50);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  command(cmd: Command) {
    switch (cmd.type) {
      case 'pause': this.paused = true; break;
      case 'resume': this.paused = false; break;
      case 'speed': this.tps = Math.min(60, Math.max(0.2, Number(cmd.tps) || 8)); break;
      case 'reset':
        this.seed = cmd.seed ?? Math.floor(Math.random() * 1e9);
        this.sim = this.o.make(this.seed);
        this.send('reset', this.meta());
        break;
      default:
        this.sim.command(cmd);
    }
    this.send('control', { paused: this.paused, tps: this.tps });
  }

  meta() {
    const s = this.sim.state;
    return {
      mode: 'live' as const,
      version: VERSION,
      seed: this.sim.seed,
      scenario: { id: this.o.scenario.id, name: this.o.scenario.name, description: this.o.scenario.description },
      scenarios: this.o.scenarios.map((x) => ({ id: x.id, name: x.name, description: x.description })),
      teams: s.teams.map((t) => ({ id: t.id, label: t.label, provider: t.provider, model: t.model, color: t.color })),
      map: { width: s.width, height: s.height, tiles: s.tiles },
      names: this.sim.names(),
      agents: this.sim.opts.agents,
      paused: this.paused,
      tps: this.tps,
    };
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, gzip = false) {
  const data = Buffer.from(JSON.stringify(body));
  if (gzip && data.length > 4096) {
    res.writeHead(status, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'cache-control': 'no-store' });
    res.end(zlib.gzipSync(data));
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}

function readBody(req: http.IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const COMMANDS = new Set(['pause', 'resume', 'speed', 'tax', 'rate', 'ubi', 'welfare', 'antitrust', 'print', 'shock', 'reset']);
const SHOCKS = new Set(['drought', 'mine_collapse', 'tech_boom', 'plague', 'gold_rush', 'trade_embargo']);

export function startServer(o: ServerOptions): Promise<{ url: string; close: () => void; runner?: LiveRunner }> {
  const log = o.log ?? (() => {});
  const runner = o.live ? new LiveRunner(o.live, log) : undefined;
  const clients = new Set<http.ServerResponse>();

  runner?.on((event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(payload);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    try {
      if (p === '/api/meta') {
        if (runner) return sendJson(res, 200, runner.meta());
        const r = o.replay!;
        return sendJson(res, 200, {
          mode: 'replay', version: VERSION, seed: r.seed, scenario: { id: r.scenario, name: r.scenario, description: '' }, scenarios: [],
          teams: r.config.teams, map: r.map, names: r.names, agents: r.config.agents, paused: true, tps: 8,
        }, true);
      }
      if (p === '/api/history') {
        const frames: Frame[] = runner ? runner.sim.history : o.replay!.frames;
        return sendJson(res, 200, frames, true);
      }
      if (p === '/api/replay') {
        const r = runner ? runner.sim.toReplay() : o.replay!;
        const body = zlib.gzipSync(Buffer.from(JSON.stringify(r)));
        res.writeHead(200, {
          'content-type': 'application/gzip',
          'content-disposition': `attachment; filename="civarena-${r.scenario}-${r.seed}-t${r.config.ticks}.civ.json.gz"`,
        });
        return res.end(body);
      }
      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': hello\n\n');
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }
      if (p === '/api/command' && req.method === 'POST') {
        if (!runner) return sendJson(res, 409, { error: 'replay mode is read-only' });
        const cmd = JSON.parse(await readBody(req)) as Command;
        if (!cmd || !COMMANDS.has(cmd.type)) return sendJson(res, 400, { error: 'unknown command' });
        if (cmd.type === 'shock' && !SHOCKS.has(cmd.kind)) return sendJson(res, 400, { error: 'unknown shock' });
        runner.command(cmd);
        return sendJson(res, 200, { ok: true, paused: runner.paused, tps: runner.tps });
      }
      // static files
      const rel = decodeURIComponent(p === '/' ? '/index.html' : p);
      const file = path.normalize(path.join(o.webRoot, rel));
      if (!file.startsWith(path.normalize(o.webRoot))) return sendJson(res, 403, { error: 'forbidden' });
      const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(o.webRoot, 'index.html');
      if (!fs.existsSync(target)) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        return res.end('Dashboard not built. Run: npm run build');
      }
      const ext = path.extname(target);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
      fs.createReadStream(target).pipe(res);
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(o.port, o.host ?? '127.0.0.1', () => {
      runner?.start();
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : o.port;
      resolve({
        url: `http://localhost:${port}`,
        runner,
        close: () => {
          runner?.stop();
          for (const c of clients) c.end();
          server.close();
        },
      });
    });
  });
}

export type { SimOptions };
