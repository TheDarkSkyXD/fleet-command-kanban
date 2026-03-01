import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

const mockNetworkInterfaces = mock.fn<typeof import("node:os").networkInterfaces>();
const mockHostname = mock.fn<typeof import("node:os").hostname>();

await mock.module("node:os", {
  namedExports: {
    default: {
      networkInterfaces: mockNetworkInterfaces,
      hostname: mockHostname,
    },
    networkInterfaces: mockNetworkInterfaces,
    hostname: mockHostname,
  },
});

const { formatListenUrls } = await import("../listen-urls.js");

beforeEach(() => {
  mockNetworkInterfaces.mock.resetCalls();
  mockHostname.mock.resetCalls();
});

describe("formatListenUrls", () => {
  it("returns localhost, non-internal IPv4 addresses, and hostname for 0.0.0.0", () => {
    mockHostname.mock.mockImplementation(() => "myhost");
    mockNetworkInterfaces.mock.mockImplementation(() => ({
      eth0: [
        {
          address: "192.168.1.42",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "192.168.1.42/24",
        },
      ],
    }));

    const urls = formatListenUrls("0.0.0.0", 3131);
    assert.deepStrictEqual(urls, [
      "http://localhost:3131",
      "http://192.168.1.42:3131",
      "http://myhost:3131",
    ]);
  });

  it("excludes IPv6 and internal addresses", () => {
    mockHostname.mock.mockImplementation(() => "myhost");
    mockNetworkInterfaces.mock.mockImplementation(() => ({
      lo: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
      eth0: [
        {
          address: "fe80::1",
          netmask: "ffff:ffff:ffff:ffff::",
          family: "IPv6",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "fe80::1/64",
          scopeid: 1,
        },
        {
          address: "10.0.0.5",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "10.0.0.5/24",
        },
      ],
    }));

    const urls = formatListenUrls("0.0.0.0", 8080);
    assert.deepStrictEqual(urls, [
      "http://localhost:8080",
      "http://10.0.0.5:8080",
      "http://myhost:8080",
    ]);
  });

  it("does not duplicate when hostname is localhost", () => {
    mockHostname.mock.mockImplementation(() => "localhost");
    mockNetworkInterfaces.mock.mockImplementation(() => ({}));

    const urls = formatListenUrls("0.0.0.0", 3000);
    assert.deepStrictEqual(urls, ["http://localhost:3000"]);
  });

  it("includes addresses from multiple NICs", () => {
    mockHostname.mock.mockImplementation(() => "server");
    mockNetworkInterfaces.mock.mockImplementation(() => ({
      eth0: [
        {
          address: "192.168.1.10",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "192.168.1.10/24",
        },
      ],
      wlan0: [
        {
          address: "10.0.0.50",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "10.0.0.50/24",
        },
      ],
    }));

    const urls = formatListenUrls("0.0.0.0", 4000);
    assert.deepStrictEqual(urls, [
      "http://localhost:4000",
      "http://192.168.1.10:4000",
      "http://10.0.0.50:4000",
      "http://server:4000",
    ]);
  });

  it("returns only the specific address when not 0.0.0.0", () => {
    const urls = formatListenUrls("127.0.0.1", 9090);
    assert.deepStrictEqual(urls, ["http://127.0.0.1:9090"]);
    assert.strictEqual(mockNetworkInterfaces.mock.callCount(), 0);
    assert.strictEqual(mockHostname.mock.callCount(), 0);
  });
});
