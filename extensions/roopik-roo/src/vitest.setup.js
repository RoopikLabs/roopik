import nock from "nock";
import "./utils/path"; // Import to enable String.prototype.toPosix().
// Disable network requests by default for all tests.
nock.disableNetConnect();
export function allowNetConnect(host) {
    if (host) {
        nock.enableNetConnect(host);
    }
    else {
        nock.enableNetConnect();
    }
}
// Global mocks that many tests expect.
global.structuredClone = global.structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));
//# sourceMappingURL=vitest.setup.js.map