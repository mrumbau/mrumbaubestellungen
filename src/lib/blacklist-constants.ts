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
  // plancraft.com entfernt — wird in email-check + webhook speziell behandelt (SU-Rechnungen)

  // Social/Marketing
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "newsletter.de",
];

export const VERSAND_DOMAINS = [
  // DHL
  "dhl.de", "dhl.com", "noreply.dhl.com", "mail.dhl.de",
  // DPD
  "dpd.de", "dpd.com", "tracking.dpd.de",
  // Hermes
  "hermes-logistik.de", "hermesworld.com", "myhermes.de",
  // UPS
  "ups.com",
  // GLS
  "gls-group.eu", "gls-group.com", "gls-pakete.de", "gls-germany.com",
  // FedEx
  "fedex.com",
  // Sonstige Paketdienste
  "trans-o-flex.com",
  "go-express.com",
  "deutschepost.de", "brief.deutschepost.de",
  // Amazon: Versand wird über Betreff erkannt, nicht Domain (amazon.de sendet auch Bestellbestätigungen)
];
