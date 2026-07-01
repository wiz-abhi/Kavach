// Tune these to control dataset size and how "obvious" the fraud rings are.
export const CONFIG = {
  NORMAL_ACCOUNTS: 400,
  NORMAL_TRANSACTIONS: 1500,

  NUM_RINGS: 4,
  RING_SIZE_MIN: 5,
  RING_SIZE_MAX: 9,
  RING_SHARED_DEVICES: 2, // how many devices are reused across each ring
  RING_SHARED_IPS: 2,
  RING_SHARED_PHONES: 1,
  RING_INTERNAL_TX_MULTIPLIER: 8, // ring members transact with each other this many times more than normal accounts do

  CITIES: [
    "Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Chennai",
    "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow",
  ],

  SEED: 42,
};
