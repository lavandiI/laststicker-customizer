module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  // Measure every runtime script, including the ones no test loads yet
  // (background.js), so the threshold reflects the real state of the project.
  collectCoverageFrom: ['*.js', '!eslint.config.js', '!jest.config.js'],
  coverageReporters: ['text-summary'],
  // Floors slightly below the current state (67/55/71/70): small refactors are
  // fine, a real loss of tests is not.
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 53,
      functions: 69,
      lines: 68,
    },
  },
};
