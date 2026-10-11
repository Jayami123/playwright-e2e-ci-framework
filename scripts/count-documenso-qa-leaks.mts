import "dotenv/config";
import {
  countDocumensoQaOrphans,
  countDocumensoQaUsers,
} from "../src/products/documenso/qa-user.js";

const users = await countDocumensoQaUsers();
const orphans = await countDocumensoQaOrphans();
console.log(JSON.stringify({ users, orphans }, null, 2));
