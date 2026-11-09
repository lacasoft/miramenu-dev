import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS } from './migrations';

const sourceRoot = join(__dirname, '..');

function migrationClassNamesOnDisk(): string[] {
  const directories = [
    join(sourceRoot, 'infrastructure', 'database', 'migrations'),
    ...readdirSync(join(sourceRoot, 'modules'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(sourceRoot, 'modules', entry.name, 'migrations')),
  ];
  return directories.flatMap((directory) => {
    try {
      return readdirSync(directory)
        .filter((file) => /^\d+-[A-Za-z]+\.ts$/.test(file))
        .map((file) => {
          const [timestamp, name] = file.replace(/\.ts$/, '').split('-');
          return `${name}${timestamp}`;
        });
    } catch {
      return [];
    }
  });
}

describe('MIGRATIONS', () => {
  it('registers every migration file, so none is silently skipped', () => {
    const registered = MIGRATIONS.map((migration) => migration.name).sort();
    expect(registered).toEqual(migrationClassNamesOnDisk().sort());
  });

  it('keeps them in the order they were written', () => {
    const timestamps = MIGRATIONS.map((migration) =>
      Number(/\d+$/.exec(migration.name)?.[0]),
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});
