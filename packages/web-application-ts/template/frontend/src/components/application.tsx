import {Routable, route} from '@layr/routable';
import React from 'react';
import {view, useAsyncMemo} from '@layr/react-integration';

import type {Application as BackendApplication} from '../../../backend/src/components/application';

export const getApplication = (Base: typeof BackendApplication) => {
  class Application extends Routable(Base) {
    ['constructor']!: typeof Application;

    @route('/') @view() static HomePage() {
      const [isHealthy, isLoading] = useAsyncMemo(async () => await this.isHealthy());

      if (isLoading) {
        return null;
      }

      return (
        <div>
          <h1>Boostr Application</h1>
          <div>The application is {isHealthy ? 'healthy' : 'unhealthy'}.</div>
        </div>
      );
    }
  }

  return Application;
};

export declare const Application: ReturnType<typeof getApplication>;

export type Application = InstanceType<typeof Application>;
