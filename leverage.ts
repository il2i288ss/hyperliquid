/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/leverage.json`.
 */
export type Leverage = {
  "address": "CVa7fiyDKgrE1EHxcgLPNJv69Yj5hLSfnfu1XhhhuR2x",
  "metadata": {
    "name": "leverage",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "closePosition",
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "pool"
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolKind",
          "type": "u8"
        },
        {
          "name": "launchedAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "solUsdE6",
          "type": "u64"
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Permissionless: anyone can liquidate a position that lost 90% of its",
        "margin and earns 10% of whatever margin is left."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "long",
          "type": "bool"
        },
        {
          "name": "margin",
          "type": "u64"
        },
        {
          "name": "leverage",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setMarket",
      "docs": [
        "Keeper flags: enable/disable leverage on a coin, e.g. when the top 10",
        "holders own too much (insider dump protection), or after graduation",
        "to point at the new DAMM v2 pool."
      ],
      "discriminator": [
        24,
        133,
        119,
        187,
        28,
        115,
        163,
        81
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "pool"
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        },
        {
          "name": "poolKind",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setParams",
      "docs": [
        "Admin can pause NEW positions and update the SOL/USD rate used for",
        "tier thresholds. Admin can never move vault funds."
      ],
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "global"
          ]
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "solUsdE6",
          "type": "u64"
        },
        {
          "name": "paused",
          "type": "bool"
        },
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updatePrice",
      "docs": [
        "Permissionless: read the pool and record a price observation.",
        "A keeper calls this every few seconds per active coin."
      ],
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.mint",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "pool"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "global",
      "discriminator": [
        167,
        232,
        232,
        177,
        200,
        108,
        114,
        127
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "positionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "paused",
      "msg": "New positions are paused"
    },
    {
      "code": 6001,
      "name": "marketDisabled",
      "msg": "Leverage is disabled on this coin"
    },
    {
      "code": 6002,
      "name": "tierLocked",
      "msg": "This coin has not unlocked leverage yet"
    },
    {
      "code": 6003,
      "name": "tooMuchLeverage",
      "msg": "Leverage above this coin's tier"
    },
    {
      "code": 6004,
      "name": "marginTooBig",
      "msg": "Margin above this coin's tier limit"
    },
    {
      "code": 6005,
      "name": "capReached",
      "msg": "Long/short capacity for this coin is full"
    },
    {
      "code": 6006,
      "name": "holdTime",
      "msg": "Minimum hold time not reached"
    },
    {
      "code": 6007,
      "name": "notLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6008,
      "name": "stalePrice",
      "msg": "Not enough price history yet"
    },
    {
      "code": 6009,
      "name": "vaultEmpty",
      "msg": "Vault cannot cover this payout"
    },
    {
      "code": 6010,
      "name": "badPool",
      "msg": "Wrong pool account"
    },
    {
      "code": 6011,
      "name": "poolLayoutNotSet",
      "msg": "Pool byte offsets not configured"
    },
    {
      "code": 6012,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "unauthorized"
    }
  ],
  "types": [
    {
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "solUsdE6",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "testBuild",
            "docs": [
              "true = devnet test build (short waits). Must be false on mainnet."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "poolKind",
            "type": "u8"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "launchedAt",
            "type": "i64"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "poolSol",
            "type": "u64"
          },
          {
            "name": "oiLong",
            "type": "u64"
          },
          {
            "name": "oiShort",
            "type": "u64"
          },
          {
            "name": "obs",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "obs"
                  }
                },
                32
              ]
            }
          },
          {
            "name": "obsIdx",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "obs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "price",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "long",
            "type": "bool"
          },
          {
            "name": "margin",
            "type": "u64"
          },
          {
            "name": "notional",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u128"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pnl",
            "type": "i64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "liquidated",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "long",
            "type": "bool"
          },
          {
            "name": "margin",
            "type": "u64"
          },
          {
            "name": "notional",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "The long/short vault. Its lamports ARE the vault balance. Anyone can send",
        "SOL to it (fee splitter, trader margins); only `finish` pays out."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lockedMargin",
            "type": "u64"
          },
          {
            "name": "degenOi",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
