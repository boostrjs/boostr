import {Routable} from '@layr/routable';
import React, {Fragment} from 'react';
import {layout, page, useData} from '@layr/react-integration';

import type {Application as BackendApplication} from '../../../backend/src/components/application';

export const extendApplication = (Base: typeof BackendApplication) => {
  class Application extends Routable(Base) {
    ['constructor']!: typeof Application;

    @layout('/') static MainLayout({children}: {children: () => any}) {
      return (
        <>
          <this.MainPage.Link>
            <h1>{process.env.APPLICATION_NAME}</h1>
          </this.MainPage.Link>
          {children()}
        </>
      );
    }

    @page('[/]') static MainPage() {
      return useData(
        async () => await this.isHealthy(),

        (isHealthy) => <p>The app is {isHealthy ? 'healthy' : 'unhealthy'}.</p>
      );
    }

    @page('[/]*') static NotFoundPage() {
      return (
        <>
          <h2>Page not found</h2>
          <p>Sorry, there is nothing here.</p>
        </>
      );
    }
  }

  return Application;
};

export declare const Application: ReturnType<typeof extendApplication>;

export type Application = InstanceType<typeof Application>;
