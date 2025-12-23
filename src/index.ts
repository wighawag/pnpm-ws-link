#!/usr/bin/env node
import {readFileSync} from 'fs';
import {resolve, join, dirname} from 'path';
import {fileURLToPath} from 'url';
import * as yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const readJSON = <T = unknown>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const glob = (base: string, patterns: string[]): string[] => patterns.map((p) => join(base, p));

/* ------------------------------------------------------------------ */
/* 1. discover repo root (look upward until pnpm-workspace.yaml)      */
/* ------------------------------------------------------------------ */
let root = __dirname;
while (root !== dirname(root)) {
	try {
		readFileSync(join(root, 'pnpm-workspace.yaml'));
		break;
	} catch {
		root = dirname(root);
	}
}
if (root === dirname(root)) throw new Error('pnpm-workspace.yaml not found');

/* ------------------------------------------------------------------ */
/* 2. enumerate every workspace package -> absolute path              */
/* ------------------------------------------------------------------ */
interface WsPkg {
	name: string;
	dir: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

const wsFile = join(root, 'pnpm-workspace.yaml');
const wsGlobs = yaml.load(readFileSync(wsFile, 'utf8')) as {packages: string[]};

const wsPkgs: WsPkg[] = glob(root, wsGlobs.packages)
	.flatMap((g) => glob(root, [g]))
	.filter((p) => p.endsWith('/package.json'))
	.map((p) => ({...readJSON(p), dir: dirname(p)}) as WsPkg);

const dirByName = Object.fromEntries(wsPkgs.map((p) => [p.name, p.dir]));

/* ------------------------------------------------------------------ */
/* 3. which package are we inspecting?                                */
/* ------------------------------------------------------------------ */
const targetName = process.argv[2] || (readJSON(join(__dirname, 'package.json')) as {name: string}).name;

const targetPkg = wsPkgs.find((p) => p.name === targetName);
if (!targetPkg) throw new Error(`workspace package “${targetName}” not found`);

/* ------------------------------------------------------------------ */
/* 4. collect workspace:* deps + the package itself                   */
/* ------------------------------------------------------------------ */
const wsDeps: Record<string, string> = {};

[targetPkg.dependencies, targetPkg.devDependencies, targetPkg.peerDependencies, targetPkg.optionalDependencies].forEach(
	(deps) =>
		Object.entries(deps || {}).forEach(([name, range]) => {
			if (range.startsWith('workspace:')) {
				if (!dirByName[name]) throw new Error(`workspace dep “${name}” not found`);
				wsDeps[name] = `link:${dirByName[name]}`;
			}
		}),
);

/* >>> add the package itself <<< */
wsDeps[targetPkg.name] = `link:${targetPkg.dir}`;

/* ------------------------------------------------------------------ */
/* 5. print ready-to-paste overrides block                            */
/* ------------------------------------------------------------------ */
console.log('"pnpm": {');
console.log('  "overrides": {');
console.log(
	Object.entries(wsDeps)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `    "${k}": "${v}"`)
		.join(',\n'),
);
console.log('  }');
console.log('}');
