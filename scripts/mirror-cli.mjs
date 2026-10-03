import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const SOURCE = 'risense-ai/respire-cli';
const DESTINATION = 'risense-ai/respire-releases';
const TARGETS = ['aarch64-apple-darwin', 'aarch64-pc-windows-msvc',
  'x86_64-pc-windows-msvc', 'aarch64-unknown-linux-gnu', 'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-musl', 'x86_64-unknown-linux-musl'];
const check = (value, message) => { if (!value) throw new Error(message); };
const gh = args => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const api = path => JSON.parse(gh(['api', path]));
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const names = TARGETS.flatMap(target => [`cli-build-${target}.json`,
  `rsrs-${target}${target.includes('windows') ? '.exe' : ''}`,
  `rsrs-${target}-runtime.tar.gz`]);

function inventory(release) {
  check(Array.isArray(release.assets) && release.assets.length === names.length,
    'Expected exactly twenty-one CLI assets');
  const assets = new Map();
  for (const asset of release.assets) {
    check(names.includes(asset.name) && !assets.has(asset.name)
      && Number.isSafeInteger(asset.size) && asset.size > 0
      && /^sha256:[a-f0-9]{64}$/.test(asset.digest || ''), 'Invalid CLI asset inventory');
    assets.set(asset.name, asset);
  }
  return assets;
}

function verifyManifest(release, manifest) {
  check(/^v\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(release.tag_name)
    && !release.draft && Boolean(release.published_at), 'Expected a published CLI version tag');
  const version = release.tag_name.slice(1);
  check(release.prerelease === version.includes('-dev.'), 'Release channel does not match version');
  const sourceVersion = /^(\d+\.\d+\.\d+)(?:-dev\.\d+)?$/.exec(manifest.cliVersion || '');
  check(sourceVersion && (release.prerelease ? sourceVersion[1] === version.split('-')[0]
    : manifest.cliVersion === version), 'Source packaging version base mismatch');
  check(manifest.schemaVersion === 1
    && manifest.binaryName === 'rsrs' && manifest.repository === `https://github.com/${SOURCE}`
    && Array.isArray(manifest.targets) && manifest.targets.length === TARGETS.length
    && new Set(manifest.targets.map(t => t.triple)).size === TARGETS.length
    && manifest.targets.every(t => TARGETS.includes(t.triple)), 'Source packaging manifest mismatch');
  return version;
}

export function verifyBuildMetadata(release, manifest, directory) {
  const version = verifyManifest(release, manifest);
  const assets = inventory(release);
  let sha;
  for (const target of TARGETS) {
    const name = `cli-build-${target}.json`;
    const bytes = readFileSync(join(directory, name)), asset = assets.get(name);
    check(bytes.length === asset.size && digest(bytes) === asset.digest, `Asset checksum mismatch: ${name}`);
    const metadata = JSON.parse(bytes.toString('utf8'));
    const binary = `rsrs-${target}${target.includes('windows') ? '.exe' : ''}`;
    const runtime = `rsrs-${target}-runtime.tar.gz`;
    check(metadata.schema_version === 1 && metadata.target === target && metadata.version === version
      && /^[a-f0-9]{40}$/.test(metadata.git_sha || '')
      && metadata.binary_file === binary && metadata.runtime_file === runtime
      && assets.get(binary).digest === `sha256:${metadata.binary_sha256}`
      && assets.get(runtime).digest === `sha256:${metadata.runtime_sha256}`,
    `Build metadata mismatch: ${target}`);
    sha ??= metadata.git_sha;
    check(metadata.git_sha === sha, 'CLI source commit differs across platforms');
  }
  check(release.target_commitish === sha, 'Published release source commit mismatch');
  return {source_sha: sha, version, assets};
}

export function verifyAssets(release, manifest, directory) {
  const result = verifyBuildMetadata(release, manifest, directory);
  for (const name of names) {
    const bytes = readFileSync(join(directory, name)), asset = result.assets.get(name);
    check(bytes.length === asset.size && digest(bytes) === asset.digest, `Asset checksum mismatch: ${name}`);
  }
  return result;
}

function existingRelease(tag) {
  const releases = JSON.parse(gh(['api', '--paginate', '--slurp',
    `repos/${DESTINATION}/releases?per_page=100`])).flat();
  return releases.find(release => release.tag_name === tag);
}

function verifyExisting(release, sourceAssets, complete) {
  const seen = new Set();
  for (const asset of release.assets) {
    const expected = sourceAssets.get(asset.name);
    check(expected && !seen.has(asset.name) && asset.size === expected.size
      && asset.digest === expected.digest, `Existing mirror asset conflicts: ${asset.name}`);
    seen.add(asset.name);
  }
  if (complete) check(seen.size === names.length, 'Published mirror is incomplete');
  return seen;
}

async function main() {
  const args = process.argv.slice(2);
  if (['--verify-directory', '--verify-metadata-directory'].includes(args[0])) {
    check(args.length === 4, 'Pass a verification mode, DIR, RELEASE_JSON and MANIFEST_JSON');
    const verify = args[0] === '--verify-directory' ? verifyAssets : verifyBuildMetadata;
    const result = verify(JSON.parse(readFileSync(args[2], 'utf8')),
      JSON.parse(readFileSync(args[3], 'utf8')), resolve(args[1]));
    console.log(JSON.stringify({verified: true, source_sha: result.source_sha,
      version: result.version, declared_asset_count: result.assets.size,
      verified_build_metadata_count: TARGETS.length,
      verified_file_count: args[0] === '--verify-directory' ? names.length : TARGETS.length}));
    return;
  }
  check(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === DESTINATION,
    'Publishing is restricted to the releases repository workflow');
  const root = join(process.env.RUNNER_TEMP, 'cli-mirror');
  mkdirSync(root, {recursive: true});
  const report = {passed: false, source_repository: SOURCE, mirror_repository: DESTINATION,
    mirror_workflow_sha: process.env.GITHUB_SHA};
  try {
    const requested = args[0] || '';
    check(args.length <= 1 && (!requested || /^v\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(requested)),
      'Pass a supported CLI version tag');
    const release = requested ? api(`repos/${SOURCE}/releases/tags/${requested}`)
      : api(`repos/${SOURCE}/releases?per_page=100`).filter(r => !r.draft && r.published_at)
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    if (!release) {
      Object.assign(report, {passed: true, outcome: 'no_published_source_release'});
      return;
    }
    check(/^v\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(release.tag_name)
      && !release.draft && release.published_at && /^[a-f0-9]{40}$/.test(release.target_commitish),
    'Published CLI release identity is invalid');
    const assets = inventory(release);
    const sha = release.target_commitish;
    check(api(`repos/${SOURCE}/git/commits/${sha}`).sha === sha, 'Source commit cannot be verified');
    let tagged = api(`repos/${SOURCE}/git/ref/tags/${release.tag_name}`).object;
    while (tagged.type === 'tag') tagged = api(`repos/${SOURCE}/git/tags/${tagged.sha}`).object;
    check(tagged.type === 'commit' && tagged.sha === sha, 'Source version tag points to another commit');
    const content = api(`repos/${SOURCE}/contents/npm/artifact-manifest.json?ref=${sha}`);
    check(content.encoding === 'base64' && typeof content.content === 'string', 'Source manifest is unavailable');
    const manifest = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
    const version = verifyManifest(release, manifest);
    Object.assign(report, {tag: release.tag_name, source_release_id: release.id,
      source_sha: sha, version, source_manifest_version: manifest.cliVersion});
    const directory = join(root, 'assets');
    mkdirSync(directory);
    let mirror = existingRelease(release.tag_name);
    if (mirror && !mirror.draft) {
      gh(['release', 'download', release.tag_name, '--repo', SOURCE,
        '--pattern', 'cli-build-*.json', '--dir', directory]);
      verifyBuildMetadata(release, manifest, directory);
      check(mirror.prerelease === release.prerelease, 'Published mirror channel conflicts');
      verifyExisting(mirror, assets, true);
      Object.assign(report, {passed: true, outcome: 'unchanged',
        verified_build_metadata_count: TARGETS.length,
        matching_asset_count: assets.size, mirror_release_id: mirror.id});
      return;
    }
    gh(['release', 'download', release.tag_name, '--repo', SOURCE, '--dir', directory]);
    const validated = verifyAssets(release, manifest, directory);
    Object.assign(report, {tag: release.tag_name, source_release_id: release.id,
      source_sha: validated.source_sha, version: validated.version, verified_asset_count: assets.size});
    const marker = `CLI source: ${SOURCE}@${validated.source_sha}`;
    if (mirror) {
      check(mirror.body?.includes(marker) && mirror.prerelease === release.prerelease,
        'Existing draft does not belong to this source distribution');
    } else {
      mirror = JSON.parse(gh(['api', '--method', 'POST', `repos/${DESTINATION}/releases`,
        '-f', `tag_name=${release.tag_name}`, '-f', `name=${release.tag_name}`,
        '-f', `body=${marker}\n\nVerified seven-platform CLI distribution.`,
        '-F', 'draft=true', '-F', `prerelease=${release.prerelease}`]));
      check(Number.isSafeInteger(mirror.id) && mirror.draft
        && mirror.tag_name === release.tag_name && mirror.body?.includes(marker),
      'Created mirror draft identity is invalid');
    }
    const existing = verifyExisting(mirror, assets, false);
    const missing = names.filter(name => !existing.has(name)).map(name => join(directory, name));
    if (missing.length) gh(['release', 'upload', release.tag_name, ...missing, '--repo', DESTINATION]);
    mirror = api(`repos/${DESTINATION}/releases/${mirror.id}`);
    verifyExisting(mirror, assets, true);
    const current = api(`repos/${SOURCE}/releases/${release.id}`);
    check(!current.draft && current.tag_name === release.tag_name
      && current.target_commitish === validated.source_sha
      && current.prerelease === release.prerelease, 'Source release changed during mirroring');
    verifyExisting(current, assets, true);
    const latest = release.prerelease ? false
      : api(`repos/${SOURCE}/releases/latest`).id === release.id;
    gh(['release', 'edit', release.tag_name, '--repo', DESTINATION, '--draft=false',
      `--prerelease=${release.prerelease}`, `--latest=${latest}`]);
    const published = api(`repos/${DESTINATION}/releases/${mirror.id}`);
    check(!published.draft && published.prerelease === release.prerelease, 'Mirror was not published correctly');
    verifyExisting(published, assets, true);
    Object.assign(report, {passed: true, outcome: 'published', mirror_release_id: published.id});
  } catch (error) {
    report.failure = error.message;
    throw error;
  } finally {
    writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
