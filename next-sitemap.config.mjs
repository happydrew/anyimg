/* eslint-env node */

/** @type {import('next-sitemap').IConfig} */
export default {
  siteUrl: "https://anyimg.cc",
  generateIndexSitemap: false,
  generateRobotsTxt: false,
  // output: "export", // Set static output here
  exclude: ["/icon.svg"]
}
