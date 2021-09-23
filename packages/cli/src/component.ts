import type {Component, MethodSchedule} from '@layr/component';

export type BackgroundMethod = {
  path: string;
  schedule?: MethodSchedule;
  query?: any;
};

export function findBackgroundMethods(rootComponent: typeof Component) {
  const backgroundMethods: BackgroundMethod[] = [];

  for (const component of rootComponent.traverseComponents()) {
    for (const method of component.getMethods()) {
      const schedule = method.getSchedule();

      if (schedule === undefined) {
        continue;
      }

      const path = `${component.getComponentName()}.${method.getName()}`;

      const query = {
        '<=': {__component: component.getComponentType()},
        [`${method.getName()}=>`]: {'()': []}
      };

      backgroundMethods.push({
        path,
        schedule,
        query
      });
    }
  }

  return backgroundMethods;
}
