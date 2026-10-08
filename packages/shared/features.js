// Features that are built but switched off for now.
//
// payments: the system is free for the MVP, so entry fees, payment records,
// the payment report and every payment screen are off. The code stays in
// place; set this to true (with a payment gateway, in the final phase) to
// bring it all back.
export const FEATURES = {
  payments: false,
}

export const paymentsEnabled = () => FEATURES.payments === true
