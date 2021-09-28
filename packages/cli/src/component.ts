import type {Component, MethodScheduling, MethodQueueing} from '@layr/component';

export type BackgroundMethod = {
  path: string;
  scheduling: MethodScheduling | undefined;
  queueing: MethodQueueing | undefined;
  maximumDuration: number | undefined;
  query?: any;
};

export function findBackgroundMethods(rootComponent: typeof Component) {
  const backgroundMethods: BackgroundMethod[] = [];

  const find = (component: typeof Component | Component) => {
    for (const method of component.getMethods()) {
      const scheduling = method.getScheduling();
      const queueing = method.getQueueing();

      if (!scheduling && !queueing) {
        continue;
      }

      const maximumDuration = method.getMaximumDuration();

      const backgroundMethod: BackgroundMethod = {
        path: component.describeComponentProperty(method.getName()),
        scheduling,
        queueing,
        maximumDuration
      };

      if (scheduling) {
        backgroundMethod.query = {
          '<=': {__component: component.getComponentType()},
          [`${method.getName()}=>`]: {'()': []}
        };
      }

      backgroundMethods.push(backgroundMethod);
    }
  };

  for (const component of rootComponent.traverseComponents()) {
    find(component);
    find(component.prototype);
  }

  return backgroundMethods;
}
