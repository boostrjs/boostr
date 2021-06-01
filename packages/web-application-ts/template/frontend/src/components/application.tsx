import {Routable} from '@layr/routable';
import React, {Fragment} from 'react';
import {layout, page, useData} from '@layr/react-integration';

import type {Application as BackendApplication} from '../../../backend/src/components/application';

export const createApplicationComponent = (Base: typeof BackendApplication) => {
  class Application extends Routable(Base) {
    ['constructor']!: typeof Application;

    @layout('/') static MainLayout({children}: {children: () => any}) {
      return (
        <>
          <this.HomePage.Link>
            <h1>Boostr Application</h1>
          </this.HomePage.Link>
          {children()}
        </>
      );
    }

    @page('[/]') static HomePage() {
      return useData(
        async () => await this.isHealthy(),

        (isHealthy) => <p>The application is {isHealthy ? 'healthy' : 'unhealthy'}.</p>
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

export declare const Application: ReturnType<typeof createApplicationComponent>;

export type Application = InstanceType<typeof Application>;
