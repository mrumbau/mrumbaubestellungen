import { describe, it, expect } from "vitest";
import { isBlockedUrl } from "../url-scraper";

describe("isBlockedUrl (SSRF-Schutz)", () => {
  describe("erlaubt öffentliche URLs", () => {
    it.each([
      "https://mrumbau.de",
      "https://www.example.com",
      "http://example.com/some/path",
      "https://acme.de:443/contact",
      "https://acme.de:80",
    ])("erlaubt %s", (url) => {
      expect(isBlockedUrl(url)).toBe(false);
    });
  });

  describe("blockiert lokale Hosts", () => {
    it.each([
      "http://localhost",
      "http://localhost:8080",
      "http://127.0.0.1",
      "http://127.0.0.1:3000",
      "http://0.0.0.0",
      "http://[::1]",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert Cloud-Metadata-Endpoints", () => {
    it.each([
      "http://metadata.google.internal",
      "http://169.254.169.254", // AWS / GCP IMDS
      "http://169.254.169.254/latest/meta-data/",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert private IP-Bereiche", () => {
    it.each([
      "http://10.0.0.1",
      "http://10.255.255.255",
      "http://172.16.0.1",
      "http://172.31.255.255",
      "http://192.168.1.1",
      "http://192.168.0.1:8080",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert IPv6-mapped IPv4-Bypass", () => {
    it.each([
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:10.0.0.1]",
      "http://[::ffff:192.168.0.1]",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert IPv6 Unique-Local & Link-Local", () => {
    it.each([
      "http://[fc00::1]",
      "http://[fd00::1]",
      "http://[fe80::1]",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert nicht-http(s) Protokolle", () => {
    it.each([
      "file:///etc/passwd",
      "ftp://example.com",
      "gopher://example.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert non-standard Ports", () => {
    it.each([
      "http://example.com:22", // SSH
      "http://example.com:25", // SMTP
      "http://example.com:3306", // MySQL
      "http://example.com:5432", // Postgres
      "http://example.com:6379", // Redis
      "http://example.com:8080", // Common dev/admin
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert Social-Media-Plattformen (anti-scraping)", () => {
    it.each([
      "https://linkedin.com/in/some-profile",
      "https://www.linkedin.com/company/abc",
      "https://xing.com/profile/Anna_Schmidt",
      "https://facebook.com/acme",
      "https://www.instagram.com/acme",
      "https://twitter.com/acme",
      "https://x.com/acme",
      "https://tiktok.com/@acme",
    ])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });

  describe("blockiert ungültige URLs", () => {
    it.each(["not-a-url", "", "://broken", "http://"])("blockiert %s", (url) => {
      expect(isBlockedUrl(url)).toBe(true);
    });
  });
});
