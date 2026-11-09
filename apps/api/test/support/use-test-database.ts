// Jest setup file: every e2e test file talks to the test database.
import { useTestDatabase } from './test-database';

useTestDatabase();
