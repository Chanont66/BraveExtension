/**
 * Configuration file for Gmail accounts.
 *
 * Each account object contains:
 * - name: (string) Display name of the user or account label
 * - email: (string) Email address
 * - avatarUrl: (string, optional) Custom image URL/path. If omitted, the extension
 *              automatically fetches the active Google Profile picture dynamically!
 */

const GMAIL_ACCOUNTS = [
  // {
  //   name: "Example Name",
  //   email: "example@gmail.com"
  // }
];

if (typeof window !== "undefined") {
  window.GMAIL_ACCOUNTS = GMAIL_ACCOUNTS;
}
