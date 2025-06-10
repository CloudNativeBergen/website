const CHECKIN_API_URL = 'https://api.checkin.no/graphql';
const CHECKIN_API_KEY = process.env.CHECKIN_API_KEY;
const CHECKIN_API_SECRET = process.env.CHECKIN_API_SECRET;

interface EventTicket {
  id: number;
  category: string;
  customer_name: string | null;
  numberOfTickets: number;
  sum: string; // price without vat
  sum_left: string; // outstanding amount
  fields: { key: string; value: string }[];
  crm: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface EventTicketsResponse {
  data: {
    eventTickets: EventTicket[];
  };
}

export async function fetchEventTickets(customerId: number, eventId: number): Promise<EventTicket[]> {
  const query = `
    query MyQuery {
      eventTickets(customer_id: ${customerId}, id: ${eventId}) {
        id
        category
        customer_name
        numberOfTickets
        sum
        sum_left
        fields {
          key
          value
        }
        crm {
          first_name
          last_name
          email
        }
      }
    }
  `;

  const response = await fetch(CHECKIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${CHECKIN_API_KEY}:${CHECKIN_API_SECRET}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch event tickets: ${response.statusText}`);
  }

  const responseData: EventTicketsResponse = await response.json();

  if (!responseData.data || !responseData.data.eventTickets) {
    throw new Error('Invalid response data');
  }

  return responseData.data.eventTickets;
}