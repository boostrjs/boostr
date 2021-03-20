import {ComponentHTTPClient} from '@layr/component-http-client';
import {Storable} from '@layr/storable';

import type {Application as BackendApplication} from '../../backend/src/components/application';
import {getApplication} from './components/application';

export default async () => {
  const client = new ComponentHTTPClient(process.env.BACKEND_URL!, {mixins: [Storable]});

  const BackendApplicationProxy = (await client.getComponent()) as typeof BackendApplication;

  const Application = getApplication(BackendApplicationProxy);

  return Application;
};
