import {Component, method, expose} from '@layr/component';

export class Application extends Component {
  @expose({call: true}) @method() static async isHealthy() {
    return true;
  }
}
