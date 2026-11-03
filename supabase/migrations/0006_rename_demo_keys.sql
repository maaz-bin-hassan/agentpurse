-- 0004 moved the demo agents to Maaz but kept the old _maya key hashes. Switch them to the _maaz keys.
UPDATE agents SET api_key_hash = '0f5dc15b73f5fdb2ce3ed084e49f3a4e1337cb12b0045a0598b8b95b56328b23', api_key_prefix = 'agpk_grocer_' WHERE id = 'agent_grocer';
UPDATE agents SET api_key_hash = 'a4c68d987093d53bb530e62c98f9dedf92a0343fb5efaaafbbf067aabde74c47', api_key_prefix = 'agpk_wayfind' WHERE id = 'agent_wayfinder';
UPDATE agents SET api_key_hash = 'c0f3fd50ad11c777237b5c2ccc7b0ad8c0aa57f6dc225ca294a39410aff548ff', api_key_prefix = 'agpk_stack_d' WHERE id = 'agent_stack';
UPDATE agents SET api_key_hash = 'e8ee8043e0f8d7b14e8103ca7a763a48af496e5f19c84ef2038c10e1ca8e1ca2', api_key_prefix = 'agpk_handy_d' WHERE id = 'agent_handy';
