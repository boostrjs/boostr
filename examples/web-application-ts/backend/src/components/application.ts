import {Component, method, expose} from '@layr/component';
import {sleep, SECOND, MINUTE} from '@layr/utilities';

export class Application extends Component {
  @expose({call: true}) @method() static async isHealthy() {
    return true;
  }

  /*
   * Production:
   * https://ap-southeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-southeast-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fbackend-web-application-ts-boostr-dev
   */
  @method({schedule: {rate: 1 * MINUTE}}) static backgroundTick() {
    console.log('Tick!');
  }

  /*
   * Development:
   * curl -v -X POST -H "Content-Type: application/json" -d '{"query": {"<=": {"__component": "typeof Application"}, "runBackgroundTask=>": {"()": []}}}' http://localhost:16782
   *
   * Production:
   * curl -v -X POST -H "Content-Type: application/json" -d '{"query": {"<=": {"__component": "typeof Application"}, "runBackgroundTask=>": {"()": []}}}' https://backend.web-application-ts.boostr.dev
   */
  @expose({call: true}) @method() static async runBackgroundTask() {
    await this.backgroundTask();
  }

  @method({queue: true, maximumDuration: 15 * SECOND}) static async backgroundTask() {
    console.log('Starting background task...');
    await sleep(10 * SECOND);
    console.log('Background task completed');
  }
}
