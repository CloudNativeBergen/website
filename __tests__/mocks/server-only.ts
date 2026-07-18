// Vitest stand-in for the `server-only` marker package: the real package
// throws outside a react-server condition, which would crash unit tests that
// import guarded server modules. The guard still functions in the Next build.
export {}
