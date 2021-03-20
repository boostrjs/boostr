import {Routable, route} from '@layr/routable';
import React from 'react';
import {view} from '@layr/react-integration';

import type {Application as BackendApplication} from '../../../backend/src/components/application';

export const getApplication = (Base: typeof BackendApplication) => {
  class Application extends Routable(Base) {
    ['constructor']!: typeof Application;

    @route('/') @view() static HomePage() {
      return <h1>Hello, Boostr!</h1>;
    }
  }

  return Application;
};

export declare const Application: ReturnType<typeof getApplication>;

export type Application = InstanceType<typeof Application>;
