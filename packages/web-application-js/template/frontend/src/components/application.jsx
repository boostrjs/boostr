import {Routable} from '@layr/routable';
import React from 'react';
import {layout, page, useData} from '@layr/react-integration';

export const extendApplication = (Base) => {
  class Application extends Routable(Base) {
    @layout('/') static MainLayout({children}) {
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
