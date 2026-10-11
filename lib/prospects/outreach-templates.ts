export const PROSPECT_OUTREACH_TEMPLATES = [
  {
    id: "intro",
    label: "Giới thiệu ban đầu",
    subject: "Vietnam sourcing for {company}",
    body: `Hello {contactName},

I’m reaching out from Vexim Trade. We help buyer teams screen suppliers in Vietnam before they spend time reviewing sources.

Is your team currently sourcing any products from Vietnam? If so, send one product and the key requirements. We can make a first pass and tell you whether it is worth a conversation.

If this is not relevant, let me know and I will not follow up.

Best,`,
  },
  {
    id: "followup",
    label: "Theo dõi sau lần liên hệ",
    subject: "Following up on Vietnam sourcing",
    body: `Hello {contactName},

I’m following up on my note about sourcing from Vietnam.

If you have a product in mind, send the category and any key requirements. We can check whether there is a suitable source to discuss. If timing is not right, just let me know.

Best,`,
  },
] as const;
