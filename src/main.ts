import { createApp } from './bootstrap.js';
import { AppConfigService } from './config/app-config.service.js';

const app = await createApp();
await app.listen(app.get(AppConfigService).port, '0.0.0.0');
