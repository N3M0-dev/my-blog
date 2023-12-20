// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "Blog of N3M0";
export const SITE_DESCRIPTION =
  "This is the blog of N3M0, where I'll log my journey. Do get in and take a look!";
export const TWITTER_HANDLE = "@none";
export const MY_NAME = "N3M0";
export const MY_NAME_Eng = "Nemo";
export const MY_ID = "@N3M0-dev";

// setup in astro.config.mjs
const BASE_URL = new URL(import.meta.env.SITE);
export const SITE_URL = BASE_URL.origin;
