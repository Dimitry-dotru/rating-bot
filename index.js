const sqlite = require("sqlite3").verbose(); // verbose для того чтобы ошибку высвечивало
const { Telegraf, session, Scenes } = require("telegraf");

const token = "6243509211:AAHslXZquS2_oj625pkSxue-sDpJkqCC4mY";
const passw = "6243509211:AAHslXZquS2_oj625pkSxue";

const bot = new Telegraf(token);
const authorizationScene = new Scenes.BaseScene("authorization");
const reviewScene = new Scenes.BaseScene("review");
const groupScene = new Scenes.BaseScene("group");
const adminScene = new Scenes.BaseScene("admin");
const userScene = new Scenes.BaseScene("user");
const rateScene = new Scenes.BaseScene("rate");
const markScene = new Scenes.BaseScene("mark");

const stage = new Scenes.Stage([
  adminScene,
  userScene,
  rateScene,
  markScene,
  groupScene,
  authorizationScene,
  reviewScene,
]);

const locStor = [];
function cancelScene(ctx, sceneToEnter) {
  ctx.reply("Отмена...").then(() => {
    ctx.scene.leave();
    ctx.scene.enter(sceneToEnter);
  });
}
async function isExist(id, username, first_name) {
  let isExist;
  if (username === undefined)
    username = "Имя пользователя отсутствует или скрыто";
  return new Promise((resolve) => {
    db.serialize(() => {
      db.get("select * from users where id = ?", [id], (err, row) => {
        if (err) {
          console.log(err.message);
        } else {
          isExist = row !== undefined && row !== null;
        }
        if (!isExist) {
          db.run(
            "insert into users (id, username, first_name, isAdmin, rating) values (?, ?, ?, ?, ?)",
            [id, username, first_name, 0, "[]"]
          );
        }
        resolve(isExist);
      });
    });
  });
}
async function rewriteUsername(id, username, first_name) {
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run("update users set username = ? where id = ?", [username, id]);
      db.run("update users set first_name = ? where id = ?", [first_name, id]);
      resolve();
    });
  });
}
function makeAdmin(id, position = 1) {
  db.serialize(() => {
    db.run("update users set isAdmin = ? where id = ?", [position, id]);
  });
}
function updateRating(userId, userName, curRate, mark, id, text = "") {
  if (curRate.findIndex((el) => el.fromId === userId) === -1) {
    curRate.push({
      from: userName,
      fromId: userId,
      text,
      mark,
    });
  } else {
    const ratingIndex = curRate.findIndex((el) => el.fromId === userId);
    curRate[ratingIndex].text = text;
    curRate[ratingIndex].mark = mark;
  }

  db.run("update users set rating = ? where id = ?", [
    JSON.stringify(curRate),
    id,
  ]);
}
async function checkAdmin(id) {
  return new Promise((resolve, reject) => {
    db.get("select * from users where id = ?", [id], (err, row) => {
      if (err) reject(err.message);
      else {
        if (row !== undefined && row !== null) {
          resolve(row.isAdmin === 1);
        } else {
          console.error("Ошибка в бд");
        }
      }
    });
  });
}
async function groupCheck(ctx) {
  const msg = ctx.update.message.from;
  const findId = locStor.findIndex((el) => el.id === msg.id);

  if (findId === -1) {
    await isExist(msg.id, msg.username, msg.first_name);
    const tempObj = {
      username: msg.username,
      id: msg.id,
      first_name: msg.first_name,
    };
    locStor.push(tempObj);
  } else if (
    locStor[findId].username !== msg.username ||
    locStor[findId].first_name !== msg.first_name
  ) {
    locStor[findId].username = msg.username;
    await rewriteUsername(msg.id, msg.username);
  }
}

// **************************GROUPScene--------------------------
groupScene.enter(async (ctx) => {
  rewriteUsername(
    ctx.update.message.from.id,
    ctx.update.message.from.username,
    ctx.update.message.from.first_name
  );
  await groupCheck(ctx);
});
groupScene.on("message", async (ctx) => {
  await groupCheck(ctx);
});
// -------------------------/GROUPScene--------------------------
// **************************AUTHORIZATIONScene------------------
authorizationScene.enter((ctx) => {
  ctx.reply("Введите пароль:");
});
authorizationScene.command("cancel", (ctx) => {
  cancelScene(ctx, "user");
});
authorizationScene.hears(passw, async (ctx) => {
  await makeAdmin(ctx.update.message.from.id);
  ctx.reply("Успешно авторизированы!").then(() => {
    ctx.scene.leave();
    ctx.scene.enter("admin");
  });
});
authorizationScene.on("message", (ctx) => {
  ctx.reply("Неправильная попытка, повторите еще раз...");
});
// -------------------------/AUTHORIZATIONScene------------------
// **************************ADMINScene--------------------------
adminScene.enter((ctx) => {
  ctx.reply("Вы вошли как админ\nОтправьте имя пользователя(или id) чтобы увидеть его рейтинг:");
});
adminScene.command("info", (ctx) => {
  ctx.reply("Вы админ!");
});
adminScene.command("logout", (ctx) => {
  ctx.reply("Выход...").then(() => {
    makeAdmin(ctx.update.message.from.id, 0);
    ctx.scene.leave();
    ctx.scene.enter("user");
  });
});
adminScene.on("message", async (ctx) => {
  const regexp = /[@]|(https?:\/\/t\.me\/)/gi;
  const msgTxt = ctx.update.message.text.replace(regexp, "");

  db.serialize(() => {
    db.get("select * from users where id = ?", [msgTxt], (err, row) => {
      if (err) {
        console.error(err.message);
        return;
      }
      if (row !== undefined) {
        const user = row;
        const ratingObj = JSON.parse(row.rating);
        const meanMark =
          ratingObj.length !== 0
            ? Math.floor(
                ratingObj.reduce((accum, el) => accum + el.mark, 0) /
                  ratingObj.length
              )
            : " -";

        let msg = `Имя пользователя: <b><i>@${user.username}</i></b>\nИмя: ${user.first_name}\nСредний балл: ${meanMark}\nОтзывы: `;
        let temp = " -";
        if (ratingObj.length) {
          temp = "\n\n";
          for (const el of ratingObj) {
            if (el.mark <= 30) {
              temp += `От: @${el.from}\nОценка:${el.mark}\n`;
              temp += `Текст отзыва: ${el.text}\n\n`;
            }
          }
          if (temp === "\n\n") temp = " -";
        }
        ctx.replyWithHTML(msg + temp).then(() => {
          ctx.reply("Можете отправить еще имя пользователя или его id");
        });
        return
      }
      db.get("select * from users where username = ?", [msgTxt], (err, row) => {
        if (err) console.error(err.message);
        else {
          if (row === undefined) {
            ctx.reply(
              "Такого пользователя нету!\nПроверьте написание имени пользователя и отправьте сообщение еще раз"
            );
            return;
          }
          const user = row;
          /* user =
            id: 623165387,
            username: 'dmitro_fewd',
            first_name: 'D1m3nt0ŕ',
            isAdmin: 1,
            rating: '[{"from":"username","fromId":1233,"text":"ShitBoy","mark":30},{"from":"dmitro_fewd","fromId":623165387,"text":"","mark":80}]',
           */
          const ratingObj = JSON.parse(row.rating);
          // ratingObj = [{ from: 'username', fromId: 1233, text: 'ShitBoy', mark: 30 }]

          const meanMark =
            ratingObj.length !== 0
              ? Math.floor(
                  ratingObj.reduce((accum, el) => accum + el.mark, 0) /
                    ratingObj.length
                )
              : " -";

          let msg = `Имя пользователя: <b><i>@${user.username}</i></b>\nИмя: ${user.first_name}\nСредний балл: ${meanMark}\nОтзывы: `;
          let temp = " -";
          if (ratingObj.length) {
            temp = "\n\n";
            for (const el of ratingObj) {
              if (el.mark <= 30) {
                temp += `От: @${el.from}\nОценка:${el.mark}\n`;
                temp += `Текст отзыва: ${el.text}\n\n`;
              }
            }
            if (temp === "\n\n") temp = " -";
          }

          ctx.replyWithHTML(msg + temp).then(() => {
            ctx.reply("Можете отправить еще имя пользователя или его id");
          });
          return;
        }
      });
    });
  });
});
// --------------------------/ADMINScene--------------------------
// **************************USERScene----------------------------
userScene.enter((ctx) => {
  ctx.reply(
    "Привет!\nОтправь /rate если хочешь оставить отзыв на конкретного пользователя"
  );
});
userScene.command("rate", (ctx) => {
  ctx.scene.leave();
  ctx.scene.enter("rate");
});
// для обновления данных, если пользователя добавили в админы
userScene.command("refresh", async (ctx) => {
  const admin = await checkAdmin(ctx.update.message.from.id);
  if (admin) {
    ctx.scene.leave();
    ctx.scene.enter("admin");
  }
});
userScene.command("login", (ctx) => {
  ctx.scene.leave();
  ctx.scene.enter("authorization");
});
// --------------------------/USERScene----------------------------
// **************************RATEScene-----------------------------
rateScene.enter((ctx) => {
  ctx.reply("Введите имя пользователя которого хотите оценить:");
});
rateScene.command("cancel", (ctx) => {
  cancelScene(ctx, "user");
});
rateScene.on("message", (ctx) => {
  const regexp = /[@]|(https?:\/\/t\.me\/)/gi;
  const txt = ctx.update.message.text.replace(regexp, "");

  db.get("select * from users where username = ?", [txt], (err, row) => {
    if (err) {
      console.error(err.message);
      return;
    }

    ctx.session.selectedUser = JSON.stringify(row);
    if (row !== undefined && row !== null) {
      ctx.reply("Введите оценку от 0 до 100 для пользователя:");
      ctx.scene.leave();
      ctx.scene.enter("mark");
    } else ctx.reply("Такого пользователя нет...\nПовторите попытку!");
  });
});
// -------------------------/RATEScene-----------------------------
// **************************MARKScene-----------------------------
markScene.enter((ctx) => {
  ctx.session.rate = null;
});
markScene.command("cancel", (ctx) => {
  cancelScene(ctx, "user");
});
markScene.hears(/[\d]/g, (ctx) => {
  const rate = ctx.update.message.text;
  if (rate.match(/[\D]/g)) {
    ctx.reply("Балл должен содержать только цифры!\nПовторите попытку");
  } else if (+rate > 100 || +rate < 0)
    ctx.reply("Балл должен быть в диапазоне от 0 до 100!\nПовторите попытку");
  else {
    ctx.session.rate = +rate;
    if (+rate <= 30) {
      ctx.reply("Оставьте отзыв, почему вы так считаете:");
      ctx.scene.leave();
      ctx.scene.enter("review");
    } else {
      // if rate is more than 30
      const user = JSON.parse(ctx.session.selectedUser);
      const rating = JSON.parse(user.rating);

      updateRating(
        ctx.update.message.from.id,
        ctx.update.message.from.username,
        rating,
        +rate,
        user.id
      );
      ctx.reply("Отзыв записан!").then(() => {
        ctx.scene.leave();
        ctx.scene.enter("user");
        ctx.session.rate = null;
      });
    }
  }
});
markScene.on("message", (ctx) => {
  ctx.reply("Оценка должна содержать цифры, попробуйте еще раз!");
});
// -------------------------/MARKScene-----------------------------
// **************************REVIEWScene---------------------------
reviewScene.command("cancel", (ctx) => {
  cancelScene(ctx, "user");
});
reviewScene.on("message", (ctx) => {
  const user = JSON.parse(ctx.session.selectedUser);
  const rating = JSON.parse(user.rating);
  updateRating(
    ctx.update.message.from.id,
    ctx.update.message.from.username,
    rating,
    +ctx.session.rate,
    user.id,
    ctx.update.message.text
  );
  ctx.reply("Отзыв записан!").then(() => {
    ctx.scene.leave();
    ctx.scene.enter("user");
    ctx.session.rate = null;
  });
});
// --------------------------/REVIEWScene---------------------------
bot.use(session());
bot.use(stage.middleware());

const db = new sqlite.Database(
  "./dataBase.db",
  sqlite.OPEN_READWRITE,
  (err) => {
    if (err) {
      console.error(err.message);
    }
  }
);

bot.on("message", async (ctx) => {
  const msg = ctx.update.message.from;
  const chatType = ctx.update.message.chat.type;

  await isExist(msg.id, msg.username, msg.first_name);

  if (chatType !== "private") {
    ctx.scene.enter("group");
    return;
  }
  const admin = await checkAdmin(msg.id);
  if (ctx.update.message.text === "/rate" && !admin) {
    ctx.scene.enter("rate");
    return;
  }
  ctx.scene.enter(admin ? "admin" : "user");
});

bot.launch();
