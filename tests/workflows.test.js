const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/release.yml'];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('github workflows', () => {
  test('pin every action by commit SHA', () => {
    // A moving major tag can be retagged at any time; a release must run the
    // exact action that was reviewed.
    const floating = [];

    WORKFLOWS.forEach((file) => {
      const matches = read(file).match(/uses:\s*\S+/g) || [];
      matches.forEach((match) => {
        const reference = match.replace(/uses:\s*/, '');
        if (!/@[0-9a-f]{40}$/.test(reference)) {
          floating.push(`${file}: ${reference}`);
        }
      });
    });

    expect(floating).toEqual([]);
  });

  test('checks the same things locally and in CI', () => {
    const ci = read(WORKFLOWS[0]);

    expect(ci).toContain('--coverage');
    expect(ci).toContain('npm run lint');
    expect(ci).toContain('npm run package');
  });

  test('cancels superseded CI runs but never a release', () => {
    const [ci, release] = WORKFLOWS.map(read);

    expect(ci).toContain('cancel-in-progress: true');
    expect(release).not.toContain('cancel-in-progress');
  });
});
