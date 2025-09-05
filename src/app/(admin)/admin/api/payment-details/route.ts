import { NextRequest, NextResponse } from 'next/server'
import { fetchOrderPaymentDetails } from '@/lib/tickets/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orderIdParam = searchParams.get('orderId')

  if (!orderIdParam) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  }

  const orderId = parseInt(orderIdParam, 10)
  if (isNaN(orderId)) {
    return NextResponse.json({ error: 'Invalid Order ID' }, { status: 400 })
  }

  try {
    const paymentDetails = await fetchOrderPaymentDetails(orderId)
    return NextResponse.json(paymentDetails)
  } catch (error) {
    console.error('Failed to fetch payment details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment details' },
      { status: 500 },
    )
  }
}
