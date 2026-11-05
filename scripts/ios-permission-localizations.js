import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { permissionCopy, permissionKeys } from './ios-permission-copy.js';

const id = (name) => createHash('sha256').update(`mrb-permissions:${name}`).digest('hex').slice(0, 24).toUpperCase();
export const iosLocale = (lang) => lang === 'no' ? 'nb' : lang;
export const stringsFile = (copy) => permissionKeys.map((key, i) => `${JSON.stringify(key)} = ${JSON.stringify(copy[i])};`).join('\n') + '\n';

// Register a native localized resource, not merely files on disk or web assets.
export function registerPermissionResources(source) {
  const group = id('variant');
  const build = id('build');
  const locales = Object.keys(permissionCopy).map(iosLocale);
  if (source.includes(`${group} /* InfoPlist.strings */`)) {
    if (!source.includes(`${build} /* InfoPlist.strings in Resources */,`) || locales.some(locale => !source.includes(`${locale}.lproj/InfoPlist.strings`))) {
      throw new Error('Incomplete native permission resource registration');
    }
    return source;
  }
  const insert = (section, entries) => {
    const end = `/* End ${section} section */`;
    if (!source.includes(end)) throw new Error(`Missing ${section}`);
    source = source.replace(end, entries + end);
  };
  insert('PBXBuildFile', `\t\t${build} /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ${group} /* InfoPlist.strings */; };\n`);
  insert('PBXFileReference', locales.map(locale => `\t\t${id(locale)} /* ${locale} */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.strings; name = "${locale}"; path = "${locale}.lproj/InfoPlist.strings"; sourceTree = "<group>"; };\n`).join(''));
  const variant = `\t\t${group} /* InfoPlist.strings */ = {\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n${locales.map(locale => `\t\t\t\t${id(locale)} /* ${locale} */,\n`).join('')}\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t};\n`;
  insert('PBXVariantGroup', variant);
  let appGroups = 0;
  source = source.replace(/(isa = PBXGroup;\s*children = \()([\s\S]*?)(\);\s*path = App;)/g, (block, start, children, end) => {
    appGroups++;
    return `${start}${children}\t\t\t\t${group} /* InfoPlist.strings */,\n\t\t\t${end}`;
  });
  let phases = 0;
  source = source.replace(/(isa = PBXResourcesBuildPhase;[\s\S]*?files = \()([\s\S]*?)(\);)/g, (block, start, files, end) => {
    phases++;
    return `${start}${files}\t\t\t\t${build} /* InfoPlist.strings in Resources */,\n\t\t\t${end}`;
  });
  // The generated Capacitor project has a single App target/resource phase.
  if (appGroups !== 1 || phases !== 1) throw new Error('Expected one App group and one Resources phase');
  if (!/knownRegions = \([\s\S]*?\);/.test(source)) throw new Error('Missing knownRegions');
  source = source.replace(/knownRegions = \(([\s\S]*?)\);/, (block, regions) => {
    const existing = new Set([...regions.matchAll(/([\w-]+)\s*,/g)].map(match => match[1]));
    return `knownRegions = (${regions}${locales.filter(locale => !existing.has(locale)).map(locale => `\t\t\t\t"${locale}",\n`).join('')}\t\t\t);`;
  });
  return source;
}

export async function writePermissionLocalizations(root) {
  const projectPath = resolve(root, 'App.xcodeproj/project.pbxproj');
  const original = await readFile(projectPath, 'utf8');
  const project = registerPermissionResources(original);
  for (const [lang, copy] of Object.entries(permissionCopy)) {
    const folder = resolve(root, 'App', `${iosLocale(lang)}.lproj`);
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, 'InfoPlist.strings'), stringsFile(copy), 'utf8');
  }
  if (project !== original) await writeFile(projectPath, project, 'utf8');
}