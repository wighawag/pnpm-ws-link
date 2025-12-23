#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'fs';
import {resolve, join, dirname, relative} from 'path';
import {fileURLToPath} from 'url';
import {glob} from 'glob';
import * as yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const readJSON = <T = unknown>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

/* ------------------------------------------------------------------ */
/* interface                                                           */
/* ------------------------------------------------------------------ */
interface WsPkg {
	name: string;
	dir: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* main logic                                                         */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const packageDirs = args.filter((arg) => arg !== '--dry');
if (packageDirs.length === 0) {
	console.error('Usage: node dist/index.js [--dry] <package-dir> [more dirs...]');
	process.exit(1);
}

const overrides: Record<string, string> = {};

for (const packageDir of packageDirs) {
	const pkgPath = join(packageDir, 'package.json');
	const pkg = readJSON(pkgPath) as WsPkg;

	// add the package itself
	overrides[pkg.name] = `link:${relative(process.cwd(), resolve(packageDir))}`;

	// collect workspace deps
	let wsPkgs: WsPkg[] | undefined;

	const deps = pkg.dependencies;
	if (deps) {
		if (!deps) continue;
		for (const [name, range] of Object.entries(deps)) {
			if (range.startsWith('workspace:')) {
				if (!wsPkgs) {
					// find workspace root
					let root = resolve(packageDir);
					while (root !== dirname(root)) {
						try {
							readFileSync(join(root, 'pnpm-workspace.yaml'));
							break;
						} catch {
							root = dirname(root);
						}
					}
					if (root === dirname(root)) throw new Error(`pnpm-workspace.yaml not found for ${packageDir}`);

					// load workspace config
					const wsFile = join(root, 'pnpm-workspace.yaml');
					const wsConfig = yaml.load(readFileSync(wsFile, 'utf8')) as {packages: string[]};

					// find all package.json files
					const pkgPaths: string[] = [];
					for (const pattern of wsConfig.packages) {
						const matches = glob.sync(join(root, pattern, 'package.json'));
						pkgPaths.push(...matches);
					}

					// read packages
					wsPkgs = pkgPaths.map((p) => ({...readJSON(p), dir: dirname(p)}) as WsPkg);
				}

				const depPkg = wsPkgs.find((p) => p.name === name);
				if (!depPkg) throw new Error(`workspace dep "${name}" not found for ${packageDir}`);
				overrides[name] = `link:${relative(process.cwd(), depPkg.dir)}`;
			}
		}
	}
}

if (dry) {
	console.log('"pnpm": {');
	console.log('  "overrides": {');
	console.log(
		Object.entries(overrides)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `    "${k}": "${v}"`)
			.join(',\n'),
	);
	console.log('  }');
	console.log('}');
} else {
	// modify current repo's package.json
	const currentPkgPath = join(process.cwd(), 'package.json');
	const currentPkg = readJSON(currentPkgPath) as any;

	if (!currentPkg.pnpm) currentPkg.pnpm = {};
	if (!currentPkg.pnpm.overrides) currentPkg.pnpm.overrides = {};

	Object.assign(currentPkg.pnpm.overrides, overrides);

	writeFileSync(currentPkgPath, JSON.stringify(currentPkg, null, 2));

	console.log('Overrides added to package.json');
}
