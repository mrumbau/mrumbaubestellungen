// Hardcodierte Domains die im Webhook automatisch ignoriert werden.
// Diese werden in der Einstellungen-UI als "System"-Einträge angezeigt.

export const IRRELEVANT_DOMAINS = [
  // Offensichtlich keine Händler
  "gmx.de", "gmx.net", "web.de", "t-online.de", "freenet.de",
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me",

  // Interne/Service-Domains
  "zapier.com", "send.zapier.com", "make.com",
  "mailchimp.com", "sendinblue.com", "brevo.com",
  "hubspot.com", "salesforce.com",
  "plancraft.com",

  // Social/Marketing
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "newsletter.de",
];

export const VERSAND_DOMAINS = [
  "dhl.de", "dhl.com",
  "dpd.de", "dpd.com",
  "hermes-logistik.de", "hermesworld.com", "myhermes.de",
  "ups.com",
  "gls-group.eu", "gls-group.com",
  "fedex.com",
  "trans-o-flex.com",
  "go-express.com",
  "deutschepost.de",
];
