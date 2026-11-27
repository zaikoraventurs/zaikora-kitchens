import serverless from 'serverless-http';
import { createApiApp } from '../../server.ts';

const apiApp = createApiApp();

export const handler = serverless(apiApp);
