// Vitest-Setup: setze Dummy-ENV-Vars für Module die zur Initialisierung
// reale API-Credentials erwarten (OpenAI). Echte API-Calls sollen via Mocks
// oder Test-Doubles laufen — diese Setup-Datei sorgt nur dafür dass der
// Module-Import nicht crash't.
process.env.OPENAI_API_KEY ??= "test-key-dummy";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role";
