/**
 * Created with WebStorm.
 * User: siguang
 * Date: 2015/4/7
 * Time: 10:28
 * 传统足彩－投注业务 zc.buy.js
 */
define("../js/example/zc.buy", [ "lib-cpBase", "lib-json", "./zc.tool.js", "./zc.odd.js" ], function(require, exports, module) {
    var _CPB = require("lib-cpBase").CPB, _JSON = require("lib-json").JSON, tool = require("./zc.tool"), sf = _CPB.sf;
    function Zc(lotId, playId) {
        // 所有玩法配置信息
        this.config = {
            "30001": {
                name: "胜负彩14场",
                len: 14,
                oldId: 13,
                r9: false,
                tm: 3,
                typeArr: [ "3", "1", "0" ]
            },
            "50001": {
                name: "胜负彩14场包胆包赔",
                len: 14,
                oldId: 13,
                r9: false
            },
            "30102": {
                name: "胜负彩任9场",
                len: 14,
                oldId: 13,
                r9: true
            },
            // 任选9胆拖
            "3010203": {
                name: "胜负彩任9场",
                len: 14,
                oldId: 13,
                dt: true,
                r9: true,
                tm: 3,
                maxDan: 8,
                typeArr: [ "3", "1", "0" ]
            },
            "30203": {
                name: "六场半全场",
                len: 12,
                oldId: 15,
                r9: false,
                tm: 3,
                typeArr: [ "3", "1", "0" ]
            },
            "30304": {
                name: "四场进球",
                len: 8,
                oldId: 16,
                r9: false,
                px: true,
                tm: 4,
                typeArr: [ "0", "1", "2", "3" ]
            }
        };
        this.lotId = lotId;
        this.playId = playId;
        this.oldId = this.config[lotId + playId].oldId;
        /*
         * datas = [	// 基础数据
         *    {0:false, 1: false, 2: false, 3, false}       // 根据config中的
         * ]
         */
        this.datas = [];
        // 存储数据
        this.nb = [];
        // 通过datas将选中的号存储到nb中 [ [1, 3], [0, 1] ];
        this.dan = [];
        // 存储任九的胆 [ [], [] ];
        this.curConfig = {};
        // 当前配置
        this.count = 0;
        // 注数
        this.amount = 0;
        // 金额
        this.multiple = 1;
        // 倍数
        this.buyType = 2;
        // 0:发起合买、1:参与合买、2:代购、3:追号、5:预约投注
        this.issue = "";
        // 期次
        this.jiezhi = false;
        // 是否停售
        this.init();
    }
    Zc.prototype = {
        // 初始化
        init: function() {
            var _this = this, oc = this.config;
            _this.curConfig = oc[_this.lotId + _this.playId];
            _this.initData();
            _this.bindEvent();
            var zcTool = window["zcTool"] = tool.zcTool();
            zcTool.init();
        },
        // 事件
        bindEvent: function() {
            var _this = this, oc = _this.curConfig;
            // 选号
            $("#zcList .n").die().live("click", function() {
                if (zcTool.leftTime <= 0 || $("#remainTime").text() == "已截止") {
                    alert("您的投注期次已截期，可以选择下一期再投.");
                    return false;
                }
                var idArr = $(this).attr("id").split("_"), playNum = idArr[1], // 比赛场
                typeNum = idArr[2], // 号码
                isSelect = $(this).hasClass("x"), selectNum = 0;
                if (isSelect) {
                    // 选中状态
                    $(this).removeClass("x");
                } else {
                    $(this).addClass("x");
                    selectNum = 1;
                }
                // 存储号码
                _this.handleNumber(selectNum, playNum, typeNum);
                _this.handleAllBtn();
                _this.outSelectField();
                // 算注、算钱
                _this.getMoney();
            });
            // 全选横列号码
            $("#zcList .quan").die().live("click", function() {
                if (zcTool.leftTime <= 0 || $("#remainTime").text() == "已截止") {
                    alert("您的投注期次已截期，可以选择下一期再投.");
                    return false;
                }
                var clsName = $(this).attr("class").indexOf("tgr");
                // 停售时全的class有tgr
                if (clsName != -1) {
                    return false;
                }
                var idArr = $(this).attr("id").split("_"), isSelect = $(this).hasClass("xz"), playNum = idArr[1], typeArr = oc.typeArr, numLen = oc.tm, selectNum = 0;
                if (isSelect) {
                    // 选中状态
                    for (var i = 0; i < numLen; i++) {
                        $("#n_" + playNum + "_" + typeArr[i]).removeClass("x");
                    }
                } else {
                    for (var i = 0; i < numLen; i++) {
                        $("#n_" + playNum + "_" + typeArr[i]).addClass("x");
                    }
                    selectNum = 1;
                }
                // 存储号码
                _this.handleNumber(selectNum, playNum, "h");
                _this.handleAllBtn();
                _this.outSelectField();
                // 算注、算钱
                _this.getMoney();
            });
            // 全选纵列号码
            $("#allNum .all").die().live("click", function() {
                if (zcTool.leftTime <= 0 || $("#remainTime").text() == "已截止") {
                    alert("您的投注期次已截期，可以选择下一期再投.");
                    return false;
                }
                var idArr = $(this).attr("id").split("_"), playNum = Number(idArr[1]), datasLen = oc.len, isSelect = $(this).attr("checked"), selectNum = 0;
                if (isSelect) {
                    for (var i = 0; i < datasLen; i++) {
                        $("#n_" + i + "_" + playNum).addClass("x");
                    }
                    selectNum = 1;
                } else {
                    for (var i = 0; i < datasLen; i++) {
                        $("#n_" + i + "_" + playNum).removeClass("x");
                    }
                }
                // 存储号码
                _this.handleNumber(selectNum, playNum, "v");
                _this.handleAllBtn();
                _this.outSelectField();
                // 算注、算钱
                _this.getMoney();
            });
            // 清除所有
            $("#clearAll").unbind().bind("click", function() {
                _this.clearAll();
            });
            //  加、减倍数
            $("#doubleUp").unbind().bind("click", function() {
                var multiple = _this.multiple, oDouble = $("#double");
                multiple++;
                if (multiple > 99) {
                    _this.multiple = 99;
                    oDouble.val("99");
                    $(this).removeClass("jia_manu").addClass("jia_manu_d");
                } else {
                    _this.multiple = multiple;
                    oDouble.val(multiple);
                    $(this).removeClass("jia_manu_d").addClass("jia_manu");
                }
                if ($("#doubleDown").hasClass("jian_manu_d")) {
                    // 控制减
                    $("#doubleDown").removeClass("jian_manu_d").addClass("jian_manu");
                }
                _this.getMoney();
            });
            $("#doubleDown").unbind().bind("click", function() {
                var multiple = _this.multiple, oDouble = $("#double");
                multiple--;
                if (multiple < 1) {
                    _this.multiple = 1;
                    oDouble.val("1");
                    $(this).removeClass("jian_manu").addClass("jian_manu_d");
                } else {
                    _this.multiple = multiple;
                    oDouble.val(multiple);
                    $(this).removeClass("jian_manu_d").addClass("jian_manu");
                }
                if ($("#doubleUp").hasClass("jia_manu_d")) {
                    // 控制加
                    $("#doubleUp").removeClass("jia_manu_d").addClass("jia_manu");
                }
                _this.getMoney();
            });
            $("#double").unbind().bind("keyup", function() {
                var curMultiple = $(this).val(), reg = /\D/g;
                $("#doubleUp").removeClass("jia_manu_d").addClass("jia_manu");
                $("#doubleDown").removeClass("jian_manu_d").addClass("jian_manu");
                if (reg.test(curMultiple)) {
                    $(this).val(_this.multiple);
                } else if (Number(curMultiple) > 99) {
                    _this.multiple = 99;
                    $(this).val("99");
                    $("#doubleUp").removeClass("jia_manu").addClass("jia_manu_d");
                } else if (Number(curMultiple) < 1) {
                    _this.multiple = 1;
                    $(this).val("1");
                    $("#doubleDown").removeClass("jian_manu").addClass("jian_manu_d");
                } else {
                    _this.multiple = Number(curMultiple);
                }
                _this.getMoney();
            });
            // 任九设胆
            $("#zcList .dan").die().live("click", function() {
                var isSelect = $(this).attr("checked"), nIndex = Number($(this).val()), oNb = _this.nb, danLen = 0;
                // 输出选中胆的个数
                for (var i = 0, danlen = _this.dan.length; i < danlen; i++) {
                    if (_this.dan[i]["select"]) {
                        danLen++;
                    }
                }
                if (isSelect) {
                    // 选中
                    if (oNb[nIndex].length == 0) {
                        $(this).attr("checked", false);
                        alert("您未选中这场比赛，不能将这场比赛作胆");
                        return false;
                    }
                    if (danLen >= oc.maxDan) {
                        $(this).attr("checked", false);
                        alert("胆的个数不能超过8个");
                        return false;
                    } else {
                        _this.dan[nIndex]["select"] = true;
                    }
                } else {
                    _this.dan[nIndex]["select"] = false;
                }
                _this.getMoney();
            });
            // 任九胆说明
            $("#danTip").mouseover(function() {
                $("#dantipsEm").show();
            });
            $("#dantips").click(function() {
                $("#dantipsEm").hide();
            });
            // 玩法下拉菜单切换
            $(".tzWf").hover(function() {
                $(this).addClass("show");
            }, function() {
                $(this).removeClass("show");
            });
            // tab期次切换
            $("#issueList a").die().live("click", function() {
                var index = $("#issueList a").index($(this));
                $("#wIssue option:eq(0)").attr("selected", "selected");
                $(".betHead").show();
                $(".bifen").hide();
                $(".w-8-caiguo").hide();
                $("#caiguo").hide();
                $(".footer-fix").show();
                $("#lotteryList").removeClass("lcbqcw");
                zcTool.appendIssue(index);
                _this.clearAll();
            });
            // 下拉菜单期次
            $("#wIssue").change(function() {
                var val = $(this).val();
                $(".all").removeAttr("checked");
                if (val == 2) {
                    // 默认
                    $("#issueList a:eq(0)").click();
                } else if (val != -1) {
                    $(".betHead").show();
                    $(".bifen").hide();
                    $(".w-8-caiguo").hide();
                    $("#caiguo").hide();
                    $("#issueList a:eq(" + val + ")").click();
                    $(".footer-fix").show();
                } else {
                    $(".betHead").hide();
                    $(".bifen").show();
                    $(".w-8-caiguo").show();
                    $("#caiguo").show();
                    $(".footer-fix").hide();
                    $("#issueList li").attr("class", "");
                    // 加载往期数据
                    zcTool.curIssue = $("#wIssue :selected").text();
                    _this.getWangMatchInfo(zcTool.curIssue);
                }
            });
            // 投注
            $("div.tzbtn").delegate("a", "click", function(e) {
                var sBuyType = "";
                if ($(this).attr("id") == "dgBuy") {
                    sBuyType = "dg";
                } else {
                    sBuyType = "hm";
                }
                _this.getBuyInfo(sBuyType);
            });
        },
        // 是否是返回修改
        isBackEdit: function() {
            var _this = this, oc = _this.curConfig;
            isEdit = $.cookie("zcBackEdit"), dataStore = _JSON.parse(decodeURI($.cookie("zcLotteryNumber")));
            if (!isEdit) {
                $.cookie("zcBackEdit", null, {
                    path: "/"
                });
                return false;
            } else if (zcTool.curIssue != dataStore.issus || zcTool.leftTime <= 0) {
                alert("期次已截期请重新选择号码");
                $.cookie("zcBackEdit", null, {
                    path: "/"
                });
                return false;
            }
            var buyNumber = dataStore.buyNumber, oNbArr = [], oDanArr = [], oDatas = _this.datas;
            // 加倍数
            var multiple = dataStore.multiple;
            _this.multiple = multiple;
            $("#double").val(multiple);
            // 拆分号码
            if (oc.r9) {
                if (buyNumber.indexOf("@") != -1) {
                    var tArr = buyNumber.split("@");
                    oNbArr = tArr[0].split("*");
                    oDanAr = tArr[1].split("*");
                } else {
                    oNbArr = buyNumber.split("*");
                }
            } else {
                oNbArr = buyNumber.split("*");
            }
            // 添加到datas数据模型中
            if (oc.r9 && buyNumber.indexOf("@") != -1) {
                // 任九胆拖
                for (var i = 0, len = oNbArr.length; i < len; i++) {
                    // 存号
                    var selNbArr = oNbArr[i].split("");
                    if (selNbArr != "4") {
                        $.each(selNbArr, function(k, v) {
                            oDatas[i][v] = true;
                            $("#n_" + i + "_" + v).trigger("click");
                        });
                    }
                }
                $.each(oDanAr, function(k, v) {
                    // 存胆
                    var inx = Number(v) - 1;
                    _this.dan[inx].select = true;
                    $("#zcList .dan").eq(inx).attr("checked", true);
                });
                _this.getMoney();
            } else {
                for (var i = 0, len = oNbArr.length; i < len; i++) {
                    var selNbArr = oNbArr[i].split("");
                    if (!_this.r9 && selNbArr != "4") {
                        $.each(selNbArr, function(k, v) {
                            oDatas[i][v] = true;
                            $("#n_" + i + "_" + v).trigger("click");
                        });
                    }
                }
            }
            $.cookie("zcBackEdit", null, {
                path: "/"
            });
            $.cookie("zcLotteryNumber", null, {
                path: "/"
            });
        },
        // 抄单
        isDetailed: function() {
            var _this = this, oc = _this.curConfig;
            isDetailed = $.cookie("zcDetailed");
            /*
             * 抄单数据： 303^13*13*13*13*13*13*13*13^256^1^512^14186
             * 303：lotteryId
             * 13*13*13*13*13*13*13*13：投注号码
             * 256：注数
             * 1：倍数
             * 512：总金额
             * 14186：期次
             * */
            var numArr = decodeURI($.cookie("zcLotteryNumber")), dataStore = numArr.split("^");
            if (!isDetailed) {
                $.cookie("zcDetailed", null, {
                    path: "/"
                });
                return false;
            } else if (zcTool.curIssue != dataStore[5] || zcTool.leftTime <= 0) {
                alert("期次已截期请重新选择号码");
                $.cookie("zcDetailed", null, {
                    path: "/"
                });
                return false;
            }
            var buyNumber = dataStore[1], oNbArr = [], oDanArr = [], oDatas = _this.datas;
            // 加倍数
            var multiple = dataStore[3];
            _this.multiple = multiple;
            $("#double").val(multiple);
            // 拆分号码
            if (oc.r9) {
                if (dataStore[6]) {
                    oNbArr = buyNumber.split("*");
                    oDanAr = dataStore[6].split(",");
                } else {
                    oNbArr = buyNumber.split("*");
                }
            } else {
                oNbArr = buyNumber.split("*");
            }
            // 添加到datas数据模型中
            if (oc.r9 && dataStore[6]) {
                // 任九胆拖
                for (var i = 0, len = oNbArr.length; i < len; i++) {
                    var selNbArr = oNbArr[i].split("");
                    if (selNbArr != "4") {
                        // 存号
                        $.each(selNbArr, function(k, v) {
                            oDatas[i][v] = true;
                            $("#n_" + i + "_" + v).trigger("click");
                        });
                    }
                }
                $.each(oDanAr, function(k, v) {
                    // 存胆
                    var inx = Number(v) - 1;
                    _this.dan[inx].select = true;
                    $("#zcList .dan").eq(inx).attr("checked", true);
                });
                _this.getMoney();
            } else {
                for (var i = 0, len = oNbArr.length; i < len; i++) {
                    var selNbArr = oNbArr[i].split("");
                    if (!_this.r9 && selNbArr != "4") {
                        $.each(selNbArr, function(k, v) {
                            oDatas[i][v] = true;
                            $("#n_" + i + "_" + v).trigger("click");
                        });
                    }
                }
            }
            $.cookie("zcDetailed", null, {
                path: "/"
            });
            $.cookie("zcLotteryNumber", null, {
                path: "/"
            });
        },
        /********************* 比赛数据 *********************/
        // 获取历史对阵信息
        getWangMatchInfo: function(issue) {
            var _this = this;
            $.get("/lottery/zcplayvs.action?lotteryId=" + _this.oldId + "&issue=" + issue + "&v=" + sf.getTimeStamp(), function(data) {
                var oData = _JSON.parse(data);
                $("#zcList").html("<tr><td colspan='11'>数据载入中……</tr></td>");
                $("#periodStatus").html("已截止");
                _this.makeWangMatchInfo(oData);
            });
        },
        // 渲染历史期次对阵信息
        makeWangMatchInfo: function(data) {
            var _this = this, sRaceHtml = "", oMatchInfo = data.matchInfo;
            if (!data) {
                return false;
            }
            for (var i = 0, len = oMatchInfo.length; i < len; i++) {
                var od = oMatchInfo[i], n1 = i * 2, n2 = i * 2 + 1, sStartTime = _CPB.str.formatDate(od.gameStartDate), oHomePh = od.homePh.split("|"), oGuestPh = od.guestPh.split("|"), oEuropeArr = od.europeSp.split(" "), obfArr = od.zuizhongbifen.split(";"), sClsQuan = "quan", trCls = "beginBet";
                if (i % 2) {
                    trCls = "beginBet oddBeginBet";
                }
                // 联赛信息
                var lsInfo = "";
                if (zcTool.matchURI.hasOwnProperty(od.leageName)) {
                    lsInfo = '<a href="' + zcTool.matchURI[od.leageName] + '" >' + od.leageName + "</a>";
                } else {
                    lsInfo = od.leageName;
                }
                // 处理中立场 playid 中有横杠
                var isZlc = false;
                if (od.playId.indexOf("-") != -1) {
                    od.playId = od.playId.replace("-", "");
                    isZlc = true;
                }
                if (lotteryId == "303") {
                    // 四场进球
                    // 比分格式化
                    var newBfArr = [];
                    for (var n = 0; n < obfArr.length; n++) {
                        var t = obfArr[n].split(":");
                        for (var s = 0; s < t.length; s++) {
                            newBfArr.push(t[s]);
                        }
                    }
                    // 计算彩果 大于3=3+，否则彩果为比分
                    var saiguo = "-", saiguo1 = "-";
                    saiguo = newBfArr[n1];
                    saiguo = saiguo > 3 ? "3+" : saiguo;
                    saiguo1 = newBfArr[n2];
                    saiguo1 = saiguo1 > 3 ? "3+" : saiguo1;
                    if (!zcTool.fs) {
                        sClsQuan = "quan tgr";
                    }
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 b-l r-s">' + '   <div class="tfr">' + _this.parsePh(od.homePh) + '       <span> 主：<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/'  + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></span>" + "   </div>" + "   <div>" + _this.parsePh(od.guestPh) + '       <span>客：<a href="http://saishi.zgzcw.com/soccer/team/'  + od.legageId + '/'  + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a></span>" + "    </div>" + "</td>" + '<td class="wh-8 b-l xh">' + "   <strong>" + newBfArr[n1] + "</strong><hr><strong>" + newBfArr[n2] + "</strong>" + "</td>" + '<td class="bf b-l">' + "   <span>" + saiguo + "</span><hr><span>" + saiguo1 + "</span>" + "</td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+'   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 b-l r-s">' + '   <div class="tfr">' + _this.parsePh(od.homePh) + '       <span> 主：<a href="http://saishi.zgzcw.com/soccer/team/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></span>" + "   </div>" + "   <div>" + _this.parsePh(od.guestPh) + '       <span>客：<a href="http://saishi.zgzcw.com/soccer/team/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a></span>" + "    </div>" + "</td>" + '<td class="wh-8 b-l xh">' + "   <strong>" + newBfArr[n1] + "</strong><hr><strong>" + newBfArr[n2] + "</strong>" + "</td>" + '<td class="bf b-l">' + "   <span>" + saiguo + "</span><hr><span>" + saiguo1 + "</span>" + "</td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + zcTool.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                } else if (lotteryId == "302") {
                    // 六场半全
                    $("#lotteryList").addClass("lcbqcw");
                    var curBf = obfArr[i].split(","), bf0 = curBf[0].replace(/-/g, ":"), bf1 = curBf[1].replace(/-/g, ":"), saiguo1 = _this.retMatchResult(curBf[0]), saiguo2 = _this.retMatchResult(curBf[1]);
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '   <a href="http://saishi.zgzcw.com/soccer/team/'  + od.legageId + '/'  + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></td>" + '<td class="wh-5">VS</td>' + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/'  + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>" + _this.parsePh(od.guestPh) + "</td>" + '<td class="wh-10 b-l"><span>半场</span><hr><span>全场</span></td>' + '<td class="wh-10 b-l bf"><span>' + bf0 + "</span><hr><span>" + bf1 + "</span></td>" + '<td class="wh-8 xh b-l"><span class="tre">' + saiguo1 + '</span><hr><span class="tre">' + saiguo2 + "</span></td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '   <a href="http://saishi.zgzcw.com/soccer/team/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></td>" + '<td class="wh-5">VS</td>' + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>" + _this.parsePh(od.guestPh) + "</td>" + '<td class="wh-10 b-l"><span>半场</span><hr><span>全场</span></td>' + '<td class="wh-10 b-l bf"><span>' + bf0 + "</span><hr><span>" + bf1 + "</span></td>" + '<td class="wh-8 xh b-l"><span class="tre">' + saiguo1 + '</span><hr><span class="tre">' + saiguo2 + "</span></td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + zcTool.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                } else if (lotteryId == "300" || lotteryId == "301") {
                    // 14场胜负
                    var sgArr = od.zuizhongbifen.split(";"), saiguo = _this.retMatchResult(sgArr[i]);
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <i>" + (i + 1) + "</i>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '   <a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/'  + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a>" + "</td>" + '<td class="wh-5 bf">' + obfArr[i].replace("-", ":") + "</td>" + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/'  + od.legageId + '/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>" + _this.parsePh(od.guestPh) + "</td>" + '<td class="wh-8-caiguo b-l bf">' + saiguo + "</td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <i>" + (i + 1) + "</i>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '   <a href="http://saishi.zgzcw.com/soccer/team/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a>" + "</td>" + '<td class="wh-5 bf">' + obfArr[i].replace("-", ":") + "</td>" + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>" + _this.parsePh(od.guestPh) + "</td>" + '<td class="wh-8-caiguo b-l bf">' + saiguo + "</td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + zcTool.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                }
            }
            $("#zcList").html(sRaceHtml);
        },
        // 解析球队排名，并返回html
        parsePh: function(ph) {
            if (ph == "" || ph.split("|").length != 3) {
                return "";
            } else {
                var p = ph.split("|");
                if (p[1] == "-") {
                    return '<em class="pm oneDat" _r="1">[' + p[0] + "]</em>";
                } else if (p[2] == "-") {
                    return '<em class="pm" _r="1">[' + p[0] + "]<br /><i>" + p[1] + "</i></em>";
                } else {
                    return '<em class="pm" _r="1">[' + p[0] + ']<br /><i title="' + p[2] + '">' + p[1] + "</i></em>";
                }
            }
        },
        // 返回比赛结果 1：2
        retMatchResult: function(result) {
            if (result == "*") {
                return result;
            }
            var oSg = result.split("-"), n1 = Number(oSg[0]), n2 = Number(oSg[1]), saiguo;
            if(oSg[0]===''){
                saiguo = '-'
            }else if (n1 > n2) {
                saiguo = 3;
            } else if (n1 == n2) {
                saiguo = 1;
            } else if (n1 < n2) {
                saiguo = 0;
            }
            return saiguo;
        },
        // rx9胆拖切换为复式
        resetRx9Info: function() {},
        // 清除所有
        clearAll: function() {
            $("#totalItem").text("0");
            $("#totalSum").text("0");
            $("#changLen").text("0");
            $("#v1Len").text("0");
            $("#v2Len").text("0");
            $("#v3Len").text("0");
            $("#v4Len").text("0");
            $("#changPos").parent().hide();
            this.count = 0;
            // 注数
            this.amount = 0;
            // 金额
            $("#zcList .n").removeClass("x");
            // 号码
            $("#zcList .quan").removeClass("xz");
            // 全
            $("#allNum input").attr("checked", false);
            // 纵列全
            if (this.curConfig.r9) {
                $("#zcList .dan").attr("checked", false);
            }
            this.initData();
        },
        /********************* 数据处理 *********************/
        // 初始化datas和nb数据模型
        initData: function() {
            var _this = this, oc = _this.curConfig, nDataLen = oc.len;
            _this.datas = [];
            _this.nb = [];
            for (var i = 0; i < nDataLen; i++) {
                var infoJson = _this.getModelData(), tempArr = [];
                _this.datas.push(infoJson);
                _this.nb.push(tempArr);
                // 任九胆的存储
                if (oc.r9) {
                    var newObj = {};
                    newObj["select"] = false;
                    _this.dan.push(newObj);
                }
            }
        },
        // 返回配置模型对象
        getModelData: function() {
            var _this = this, oc = _this.curConfig, numArr = oc.typeArr, numLen = oc.tm, // 号码长度
            o = {};
            for (var i = 0; i < numLen; i++) {
                o[numArr[i]] = false;
            }
            return o;
        },
        // 对选中或取消的号码进行处理
        // @type:0取消号码  1添加号码    @index比赛场次的下标   @selectNum选择的号码，"h"为横向全选，"v"为纵向全选
        handleNumber: function(type, index, selectNum) {
            var _this = this, oC = _this.curConfig, oD = _this.datas, isSelect = true, numArr = oC.typeArr;
            index = Number(index);
            isSelect = type == 0 ? false : true;
            if (selectNum == "h") {
                // 全选横
                $.each(numArr, function(k, v) {
                    oD[index][numArr[k]] = isSelect;
                });
            } else if (selectNum == "v") {
                // 全选纵
                $.each(oD, function(k, v) {
                    oD[k][index] = isSelect;
                });
            } else {
                oD[index][selectNum] = isSelect;
            }
            // 任九胆，处理当前比赛选中号码都取消选中状态，在将胆取消
            if (oC.r9) {
                var isSelect = false;
                $.each(oD[index], function(k, v) {
                    if (v) {
                        isSelect = true;
                        return false;
                    }
                });
                if (!isSelect) {
                    // 有选中的号码
                    $("#dan_" + index).attr("checked", false);
                    _this.dan[index].select = false;
                }
            }
            _this.handleNb();
        },
        // 将datas中选中的号码存储到nb中
        handleNb: function() {
            var _this = this, oD = _this.datas, oNb = _this.nb;
            for (var i = 0, len = oD.length; i < len; i++) {
                oNb[i] = [];
                $.each(oD[i], function(k, v) {
                    if (v) {
                        oNb[i].push(k);
                    }
                });
            }
        },
        // 输出选择的场数、单选、双选、三选和全选
        outSelectField: function() {
            var _this = this, oNb = _this.nb, n1 = 0, n2 = 0, n3 = 0, allNum = 0, selectNum = 0;
            $.each(oNb, function(k, v) {
                var numLen = v.length;
                switch (numLen) {
                  case 1:
                    n1++;
                    selectNum++;
                    break;

                  case 2:
                    n2++;
                    selectNum++;
                    break;

                  case 3:
                    n3++;
                    selectNum++;
                    break;

                  case 4:
                    allNum++;
                    selectNum++;
                    break;

                  default:
                    break;
                }
                $("#changLen").text(selectNum);
                $("#v1Len").text(n1);
                $("#v2Len").text(n2);
                $("#v3Len").text(n3);
                $("#v4Len").text(allNum);
            });
        },
        // 通过datas来控制横、纵的全选按钮是否为选中状态
        handleAllBtn: function() {
            var _this = this, oc = _this.curConfig, od = _this.datas, typeArr = oc.typeArr, odLength = od.length, numLength = _this.curConfig.tm, isAll;
            for (var i = 0; i < odLength; i++) {
                var oQuan = $("#quan_" + i);
                isAll = true;
                $.each(od[i], function(k, v) {
                    // [{0: false, 1: true, 2: false, 3: false}]
                    if (!v) {
                        isAll = false;
                    }
                });
                // true为当前横为全部选中状态
                isAll ? oQuan.addClass("xz") : oQuan.removeClass("xz");
            }
            for (var k = 0; k < numLength; k++) {
                var oAllNum = $("#all_" + typeArr[k]);
                isAll = true;
                for (var s = 0; s < odLength; s++) {
                    if (!od[s][typeArr[k]]) {
                        isAll = false;
                    }
                }
                // true为当前横为全部选中状态
                isAll ? oAllNum.attr("checked", true) : oAllNum.attr("checked", false);
            }
        },
        // 通过nb返回任九需要的数据格式，如果是胆不添加，例：["2-zc", .....] 两场
        getR9DataFormat: function() {
            var _this = this, oArr = [], oDan = _this.dan, nb = this.nb;
            $.each(nb, function(k, v) {
                var nArrLen = v.length;
                if (nArrLen > 0 && !oDan[k].select) {
                    var tempArr = [];
                    tempArr.push(nArrLen + "-zc");
                    oArr.push(tempArr);
                }
            });
            return oArr;
        },
        /********************* 算钱、算注 *********************/
        // 算注数
        getBetting: function() {
            var _this = this, oc = _this.curConfig, oNb = _this.nb, nbLen = oNb.length, count = 1, dan = [];
            if (oc.r9) {
                // 任九
                count = 0;
                // 将选中的胆存成一个二维数组  ["1-zc", "3-zc"]为第一个球队设胆并且选中1个号码，第二个球队设胆并且3个号码全部选中
                for (var i = 0, danlen = _this.dan.length; i < danlen; i++) {
                    if (_this.dan[i]["select"]) {
                        var danSize = oNb[i].length;
                        var tempDan = [ danSize + "-zc" ];
                        dan.push(tempDan);
                    }
                }
                var oNbData = _this.getR9DataFormat(), group = sf.dl(oNbData, dan, 9);
                $.each(group, function(i, g) {
                    var zs = sf.myCal("9_1", g);
                    count += zs;
                });
            } else {
                // 其它玩法
                for (var i = 0; i < nbLen; i++) {
                    count *= oNb[i].length;
                }
            }
            return count;
        },
        // 算金额
        getMoney: function() {
            var _this = this, count = _this.getBetting();
            // 任九组合串关提示位置
            if (_this.lotId == "301") {
                var size = Number($("#changLen").html());
                if (size > 9) {
                    $("#changPos").html(size).parent().show();
                } else {
                    $("#changPos").parent().hide();
                }
            }
            // 输出注数和金额
            _this.count = count;
            _this.amount = count * 2 * _this.multiple;
            $("#totalItem").text(count);
            $("#totalSum").text(_this.amount);
        },
        // 投注
        getBuyInfo: function(t) {
            var _this = this, oC = this.config[_this.lotId + _this.playId];
            if (_this.count == 0) {
                alert("你尚未选择号码");
                return false;
            }
            if (Number(_this.amount) > 15e5) {
                alert("方案总金额不能大于150万!");
                return false;
            }
            /*
                lotteryId ：彩种id
                playid	  ：玩法id
                modelId   ：后端需要的id
                buyNumber ：选中的号码
                buyMatch  ：选中的主客对信息和球队的链接
                issue	  ：期次
                count	  ：注数
                multiple  ：倍数
                totalSum  ：总金额
                betsType  : 投注类型（dg代购，hm合买）
            */
            var buyNb = [], modelId = "02", strNb = "", nbArr = [], oDanArr = [], oBuyMatch = [];
            // buyNumber
            if (oC.r9) {
                // 号
                for (var i = 0, len = _this.datas.length; i < len; i++) {
                    var od = _this.datas[i], tArr = [];
                    $.each(od, function(k, v) {
                        if (v) {
                            tArr.push(k);
                        }
                    });
                    if (tArr.length == 0) {
                        nbArr.push("4");
                    } else {
                        nbArr.push(tArr.join(""));
                    }
                }
                // 胆
                for (var n = 0, nLen = _this.dan.length; n < nLen; n++) {
                    if (_this.dan[n].select) {
                        oDanArr.push(n + 1);
                    }
                }
                if (oDanArr.length > 0) {
                    strNb = nbArr.join("*") + "@" + oDanArr.join("*");
                    modelId = "03";
                } else {
                    strNb = nbArr.join("*");
                }
            } else {
                for (var i = 0, len = _this.datas.length; i < len; i++) {
                    var od = _this.datas[i], tArr = [];
                    $.each(od, function(k, v) {
                        if (v) {
                            tArr.push(k);
                        }
                    });
                    buyNb.push(tArr.join(""));
                }
            }
            // buyMatch
            var mLen = zcTool.matchInfo.length;
            for (var m = 0; m < mLen; m++) {
                var oInfo = zcTool.matchInfo[m];
                var o = {
                    hostName: oInfo.hostNameFull,
                    guestName: oInfo.guestNameFull,
                    hostId: oInfo.hostId,
                    guestId: oInfo.guestId
                };
                oBuyMatch.push(o);
            }
            var dataStore = {
                lotteryId: _this.lotId,
                playId: _this.playId,
                modelId: _this.oldId,
                issus: zcTool.curIssue,
                count: _this.count,
                multiple: _this.multiple,
                totalSum: _this.amount,
                buyNumber: oC.r9 ? strNb : buyNb.join("*"),
                buyMatch: oBuyMatch,
                betsType: t
            };
            var sVal = encodeURI(_JSON.stringify(dataStore));
            if (t == "dg") {
                location.href = "/lottery/zucai/zc_affirm.jsp?value=" + sVal;
            } else if (t == "hm") {
                location.href = "/lottery/zucai/zc_buy_affirm.jsp?value=" + sVal;
            }
            var exp = new Date();
            exp.setTime(exp.getTime() + 24 * 60 * 60 * 1e3);
            $.cookie("zcLotteryNumber", sVal, {
                domin: location.hostname,
                path: "/",
                expiress: exp.toGMTString()
            });
        }
    };
    var zc = function(lotteryId, palyid) {
        return new Zc(lotteryId, palyid);
    };
    exports.zc = zc;
});
/**
 * Created with WebStorm.
 * User: siguang
 * Date: 2015/4/7
 * Time: 16:36
 * 传统足彩－投注业务 zc.tool.js
 */
define("../js/example/zc.tool", [ "lib-cpBase", "lib-json", "./zc.odd.js" ], function(require, exports, module) {
    var _CPB = require("lib-cpBase").CPB, _JSON = require("lib-json").JSON, _sf = _CPB.sf, _str = _CPB.str, _arr = _CPB.arr;
    function ZcTool() {
        this.args = {
            "300": {
                name: "胜负彩14场",
                oldId: 13,
                cpTime: "周一至周五 9:00-00:00 周六/日 9:00-01:00"
            },
            "301": {
                name: "胜负彩任9场",
                oldId: 13,
                cpTime: "周一至周五 9:00-00:00 周六/日 9:00-01:00"
            },
            "302": {
                name: "六场半全场",
                oldId: 15,
                cpTime: "周一至周五 9:00-00:00 周六/日 9:00-01:00"
            },
            "303": {
                name: "四场进球",
                oldId: 16,
                cpTime: "周一至周五 9:00-00:00 周六/日 9:00-01:00"
            }
        };
        this.oldId = this.args[lotteryId].oldId;
        this.lotId = lotteryId;
        this.curIssue = "";
        // 当前期
        this.issues = [];
        // 期次列表
        this.ysIssues = [];
        // 比赛信息
        this.matchInfo = [];
        this.colorful = [ "rq_red", "rq_blue", "rq_green", "rq_light" ];
        this.timer = null;
        // 倒计时定时器
        this.leftTime = 0;
        // 倒计时时间
        this.fs = true;
        // true可投注，false未开售
        this.isUp = false;
        // 是否是单式上传
        this.isDt = false;
        // 是否是任九胆拖投注
        this.jiezhi = false;
        // 是否停售
        this.matchURI = {
            "英超": "http://saishi.zgzcw.com/soccer/league/36",
            "英冠": "http://saishi.zgzcw.com/soccer/league/37",
            "英甲": "http://saishi.zgzcw.com/soccer/league/39",
            "意甲": "http://saishi.zgzcw.com/soccer/league/34",
            "意乙": "http://saishi.zgzcw.com/soccer/league/40",
            "德甲": "http://saishi.zgzcw.com/soccer/league/8",
            "德乙": "http://saishi.zgzcw.com/soccer/league/9",
            "西甲": "http://saishi.zgzcw.com/soccer/league/31",
            "西乙": "http://saishi.zgzcw.com/soccer/league/33",
            "法甲": "http://saishi.zgzcw.com/soccer/league/11",
            "法乙": "http://saishi.zgzcw.com/soccer/league/12",
            "荷甲": "http://saishi.zgzcw.com/soccer/league/16",
            "荷乙": "http://saishi.zgzcw.com/soccer/league/17",
            "苏超": "http://saishi.zgzcw.com/soccer/league/29",
            "威尔士超": "http://www.zgzcw.com/html/weichao.shtm",
            "冰超": "http://www.zgzcw.com/html/bingchao.shtm",
            "葡超": "http://saishi.zgzcw.com/soccer/league/23",
            "希腊甲": "http://www.zgzcw.com/html/xilajia.shtm",
            "罗甲": "http://saishi.zgzcw.com/soccer/league/124",
            "保超": "http://saishi.zgzcw.com/soccer/league/131",
            "瑞超": "http://saishi.zgzcw.com/soccer/league/26",
            "瑞典超": "http://saishi.zgzcw.com/soccer/league/26",
            "瑞典超级联赛": "http://saishi.zgzcw.com/soccer/league/26",
            "瑞甲": "http://saishi.zgzcw.com/soccer/league/121",
            "瑞士超": "http://saishi.zgzcw.com/soccer/league/27",
            "瑞士甲": "http://saishi.zgzcw.com/soccer/league/121",
            "奥甲": "http://saishi.zgzcw.com/soccer/league/3",
            "奥乙": "http://saishi.zgzcw.com/soccer/league/128",
            "丹超": "http://saishi.zgzcw.com/soccer/league/7",
            "丹甲": "http://saishi.zgzcw.com/soccer/league/127",
            "芬超": "http://saishi.zgzcw.com/soccer/league/13",
            "11芬超": "http://saishi.zgzcw.com/soccer/league/13",
            "芬甲": "http://saishi.zgzcw.com/soccer/league/212",
            "挪超": "http://saishi.zgzcw.com/soccer/league/22",
            "挪甲": "http://saishi.zgzcw.com/soccer/league/123",
            "爱超": "http://saishi.zgzcw.com/soccer/league/1",
            "爱甲": "http://saishi.zgzcw.com/soccer/league/139",
            "克甲": "http://saishi.zgzcw.com/soccer/league/133",
            "拉甲": "http://www.zgzcw.com/html/lajia.shtm",
            "立甲": "http://www.zgzcw.com/html/lijia.shtm",
            "波甲": "http://saishi.zgzcw.com/soccer/league/221",
            "白俄超": "http://www.zgzcw.com/html/baiechao.shtm",
            "中超": "http://saishi.zgzcw.com/soccer/league/60",
            "中甲": "http://saishi.zgzcw.com/soccer/league/61",
            "比甲": "http://saishi.zgzcw.com/soccer/league/5",
            "匈甲": "http://saishi.zgzcw.com/soccer/league/136",
            "乌甲": "http://www.zgzcw.com/html/wujia.shtm",
            "捷甲": "http://www.zgzcw.com/html/jiejia.shtm",
            "斯亚超": "http://www.zgzcw.com/html/siyachao.shtm",
            "塞黑甲": "http://www.zgzcw.com/html/saiheijia.shtm",
            "俄超": "http://saishi.zgzcw.com/soccer/league/10",
            "俄甲": "http://saishi.zgzcw.com/soccer/league/235",
            "土超": "http://saishi.zgzcw.com/soccer/league/30",
            "土甲": "http://saishi.zgzcw.com/soccer/league/130",
            "以色列超": "http://saishi.zgzcw.com/soccer/league/118",
            "塞浦甲": "http://www.zgzcw.com/html/saijia.shtm",
            "韩K联赛": "http://saishi.zgzcw.com/soccer/league/15",
            "日J联赛": "http://saishi.zgzcw.com/soccer/league/25",
            "J联赛": "http://saishi.zgzcw.com/soccer/league/25",
            "日本职业联赛": "http://saishi.zgzcw.com/soccer/league/25",
            "南非世界杯": "http://www.zgzcw.com/cups/2010/index.shtml",
            "世界杯预选赛": "http://saishi.zgzcw.com/soccer/cup/75",
            "冠军杯": "http://saishi.zgzcw.com/soccer/cup/103",
            "联盟杯": "http://www.zgzcw.com/cups/UEFA_Cup/UEFA_Cup.shtml",
            "托托杯": "http://www.zgzcw.com/html/tuotuo.shtm",
            "欧洲杯": "http://saishi.zgzcw.com/soccer/cup/67",
            "美洲杯": "http://saishi.zgzcw.com/soccer/cup/224",
            "阿甲": "http://saishi.zgzcw.com/soccer/league/2",
            "巴甲": "http://saishi.zgzcw.com/soccer/league/4",
            "巴 甲": "http://saishi.zgzcw.com/soccer/league/4",
            "巴西甲": "http://saishi.zgzcw.com/soccer/league/4",
            "哥伦甲": "http://saishi.zgzcw.com/soccer/league/250",
            "智甲": "http://saishi.zgzcw.com/soccer/league/415",
            "墨甲": "http://saishi.zgzcw.com/soccer/league/140",
            "美职": "http://saishi.zgzcw.com/soccer/league/21",
            "斯甲": "http://www.zgzcw.com/html/sikejia.shtm",
            "德联赛杯": "http://saishi.zgzcw.com/soccer/cup/52",
            "法联赛杯": "http://saishi.zgzcw.com/soccer/cup/55",
            "英联赛杯": "http://saishi.zgzcw.com/soccer/cup/84",
            "西国王杯": "http://www.zgzcw.com/cups/Spain.shtm",
            "法足协杯": "http://www.zgzcw.com/cups/FranceISO.shtm",
            "英足总杯": "http://saishi.zgzcw.com/soccer/cup/90",
            "女足世界杯": "http://saishi.zgzcw.com/soccer/cup/388",
            "女世杯": "http://saishi.zgzcw.com/soccer/cup/388",
            "世杯女 ": "http://data.zgzcw.com/section/wwc2011/index.jsp",
            "世杯女": "http://data.zgzcw.com/section/wwc2011/index.jsp",
            "意杯": "http://saishi.zgzcw.com/soccer/cup/83/",
            "挪威杯": "http://saishi.zgzcw.com/soccer/cup/64/",
            "德超杯": "http://saishi.zgzcw.com/soccer/cup/842/",
            "欧冠": "http://saishi.zgzcw.com/soccer/cup/103/",
            "亚冠": "http://saishi.zgzcw.com/soccer/cup/192/",
            "欧罗巴": "http://saishi.zgzcw.com/soccer/cup/113",
            "友谊赛": "http://saishi.zgzcw.com/soccer/cup/41",
            "超级杯": "http://saishi.zgzcw.com/soccer/cup/109/",
            "德国杯": "http://saishi.zgzcw.com/soccer/cup/51/",
            "国王杯": "http://saishi.zgzcw.com/soccer/cup/81/",
            "足总杯": "http://saishi.zgzcw.com/soccer/cup/90/",
            "法国杯": "http://saishi.zgzcw.com/soccer/cup/54/",
            "欧冠杯": "http://saishi.zgzcw.com/soccer/cup/103/",
            "亚冠杯": "http://saishi.zgzcw.com/soccer/cup/192/"
        };
        // 通过url has来看是哪个玩法nav=ds单式上传
        this.curUrl = _str.urlHas();
        if (this.curUrl.nav == "ds") {
            this.isUp == true;
        }
        // 是否是任九胆拖玩法
        if (lotteryId + playId == "3010203") {
            this.isDt = true;
            // rx9胆拖投注
            this.time2Fs = 0;
        }
        this.isSale();
    }
    ZcTool.prototype = {
        constructor: ZcTool,
        init: function() {
            this.appendIssue(0);
            this.getPrizeInfo();
            $(".sj").die().live("click", function() {
                var sUrl = $(this).attr("data-href");
                var sZlc = $(this).attr("data-zlc");
                if (sZlc == "true") {
                    $.confirm("您好，您将要打开的数据页面中，主客场位置与现在投注页相反，投注时请确认主客队位置，一旦提交，我们将按照您的所选选项执行。", function(event) {
                        window.open(sUrl)
                    });
                } else {
                    window.open(sUrl)
                    // location.href = sUrl;
                }
            });
        },
        // 是否停售
        isSale: function() {
            var stat = $.trim($.ajax({
                url: "/lottery/checkLottery.action?lotteryId=" + lotteryId,
                async: false
            }).responseText);
            if (stat == "true") {
                this.jiezhi = false;
            }
            this.jiezhi = false;
        },
        // 获取期次，切换期次  @indexIssue: 切换期次下标
        appendIssue: function(indexIssue) {
            var _this = this, sUrl = "/lottery/getissue.action?lotteryId=" + lotteryId + "&issueLen=20&d=" + _sf.getTimeStamp();
            $.get(sUrl, function(data) {
                var oArr = _JSON.parse(data), lenN = oArr.length - 1, tabIsuseHtml = "";
                // tab选择期次
                // 没有期次数据退出程序
                if (oArr.length == 0) {
                    return false;
                }
                _this.curIssue = oArr[indexIssue].issue;
                // 当前期次
                for (var i = 0, len = oArr.length; i < len; i++) {
                    // 单式上传
                    var noDisplay = "", css = i == indexIssue ? "cur" : "";
                    if (_this.isUp && $("#dsNowUp").attr("checked") && oArr[i].status != 1) {
                        noDisplay = "display:none";
                    }
                    tabIsuseHtml += '<li class="' + css + '" style="' + noDisplay + '" _status="' + oArr[i].status + '"><a href="javascript:;;" value="' + oArr[i].issue + '">' + oArr[i].issue + "期</a></li>";
                    if (lenN < 0) {
                        wIssue += '<option value="' + lenN + '">' + oArr[lenN].issue + "</option>";
                    }
                    lenN--;
                    if (oArr[i].status != 1) {
                        _this.ysIssues.push(oArr[i].issue);
                    }
                    _this.issues.push(oArr[i].issue);
                    // 预投
                    if (_str.urlHas().issue) {
                        $("#money").html(_str.urlHas().money);
                        $("#money1").html(Math.ceil(_str.urlHas().money * .7));
                        if (_str.urlHas().issue == oArr[i].issue) {
                            indexIssue = i;
                        }
                    }
                }
                // 不同玩法的 leftTime值不同调用
                if (_this.isUp) {
                    _this.leftTime = oArr[indexIssue].fsLeftTime;
                } else if (_this.isDt) {
                    _this.leftTime = oArr[indexIssue].fsLeftTime;
                    // 胆拖投注
                    // 胆拖截止
                    if (_this.leftTime < 0) {
                        _this.leftTime = oArr[indexIssue].leftTime;
                        _this.isDt = false;
                    } else {
                        _this.time2Fs = oArr[indexIssue].leftTime - _this.leftTime;
                    }
                    // 胆拖投注时复式截止时间
                    _this.switchRx9Fs();
                } else {
                    _this.leftTime = oArr[indexIssue].leftTime;
                }
                // _this.greenTimeColl = _this.leftTime;
                clearInterval(_this.timer);
                $("#remainTime").html("加载中...");
                // 是否停售，未停售走倒计时时间
                if (_this.jiezhi) {
                    $("#remainTime").html("已停售");
                } else {
                    _this.timer = setInterval(function() {
                        _this.remainTime();
                    }, 1e3);
                }
                // 预约期不能复式
                var statusTitle = "";
                if (oArr[indexIssue].status != 1) {
                    $("#allNum .all").attr("disabled", true);
                    _this.fs = false;
                    statusTitle = "未开售";
                } else {
                    $("#allNum .all").attr("disabled", false);
                    _this.fs = true;
                    statusTitle = "热销中";
                }
                $("#periodStatus").html(statusTitle);
                // 更多截期时间 - 处理单式上传
                var fsEndTime = "";
                if (_this.isUp) {
                    fsEndTime = _CPB.str.parseDate(oArr[indexIssue].fsEndTime);
                    var tempDate = new Date(fsEndTime.getTime() - 40 * 60 * 1e3);
                    $("#more10w").html(_CPB.str.formatDateA(tempDate));
                    $("#ge10w").html(_CPB.str.formatDateA(tempDate));
                }
                fsEndTime = oArr[indexIssue].fsEndTime;
                $("#endTime").html(oArr[indexIssue].endTime);
                // 复式停售时间
                $("#issueList").html(tabIsuseHtml);
                // tab切换期次
                $("#dsEndTime").html(fsEndTime).attr("dsEndTime", fsEndTime);
                $("#uploadEndTime").html(fsEndTime);
                // 上传截止
                _this.getRaceData(_this.curIssue);
                // 渲染对阵
                _this.getIssueSelectList();
            });
        },
        // 倒计时
        remainTime: function() {
            var _this = this;
            if (_this.leftTime < 0) {
                if (_this.time2Fs) {
                    // rx9胆拖调整为复式
                    _this.leftTime = _this.time2Fs - 1;
                    _this.time2Fs = 0;
                    // _this.switchFs();
                    return;
                }
                clearInterval(_this.timer);
                _this.clearGreenChannel();
                return false;
            }
            var d = 0, h = 0, m = 0, s = 0;
            var ah = 0, am = 0;
            if (_this.leftTime > 86400) {
                d = Math.floor(_this.leftTime / 86400);
                ah = _this.leftTime % 86400;
                //得到小时
                if (ah > 3600) {
                    h = Math.floor(ah / 3600);
                    am = ah % 3600;
                    //得到秒
                    if (am > 60) {
                        m = Math.floor(am / 60);
                        s = am % 60;
                    } else {
                        s = am;
                    }
                } else {
                    am = ah % 3600;
                    // 得到秒
                    if (am > 60) {
                        m = Math.floor(am / 60);
                        s = am % 60;
                    } else {
                        s = am;
                    }
                }
            } else {
                // 如果不够一天
                if (_this.leftTime > 3600) {
                    h = Math.floor(_this.leftTime / 3600);
                    am = _this.leftTime % 3600;
                    // 得到秒
                    if (am > 60) {
                        m = Math.floor(am / 60);
                        s = am % 60;
                    } else {
                        s = am;
                    }
                } else {
                    if (_this.leftTime > 60) {
                        m = Math.floor(_this.leftTime / 60);
                        s = _this.leftTime % 60;
                    } else {
                        s = _this.leftTime;
                    }
                }
            }
            if (m < 10) m = "0" + m;
            if (s < 10) s = "0" + s;
            if (d > 0) {
                var hasTime = d + "天 " + h + "时" + m + "分" + s + "秒";
            } else if (d < 1 && h > 0) {
                var hasTime = h + "时" + m + "分" + s + "秒";
            } else if (d < 1 && h < 1 && m > 0) {
                var hasTime = m + "分" + s + "秒";
            } else if (d < 1 && h < 1 && m < 1 && s > 0) {
                var hasTime = s + "秒";
            } else {
                var hasTime = "00秒";
            }
            _this.leftTime--;
            $("#remainTime").html(hasTime);
        },
        clearGreenChannel: function() {
            $("#remainTime").html("已截止");
        },
        // 处理任九玩法，胆玩法比复式截期早两个小时
        switchRx9Fs: function(f) {
            var _this = this;
            if (_this.leftTime <= 0) {
                $("#dtEnd").html("<span>当前胆拖投注已经截止。</span>").addClass("tre");
                $("#zcList .dan").removeAttr("checked").attr("disabled", "disabled");
                if (!!f) {
                    zcBuy.resetRx9Info();
                    $.alert("胆拖投注已经截止，当前场次只能按复式进行投注。");
                    setTimeout(function() {
                        $.alertClose();
                    }, 5e3);
                }
            } else {
                $("#dtEnd").html('胆拖截止：<label id="dsEndTime">载入中...</label>').removeClass("tre");
                $("#zcList .dan").removeAttr("disabled").attr("disabled", "");
            }
        },
        /******************** 期次、开奖 *******************/
        // 获取期次填加到下拉列表中
        getIssueSelectList: function() {
            var _this = this, sUrl = "/lottery/getwqissuereturnall.action?lotteryId=" + lotteryId + "&issueLen=20&d=" + _sf.getTimeStamp();
            $.ajax({
                url: sUrl,
                type: "get",
                dataType: "json",
                success: function(data) {
                    var sIssue = '<option selected="selected" value="2" _isHis="1">历史期次</option>';
                    for (var i = 0, len = data.length; i < len; i++) {
                        var haveIssue = _arr.find(_this.issues, data[i].issue);
                        if (haveIssue == -1 && data[i].status != "9") {
                            sIssue += '<option value="-1">' + data[i].issue + "</option>";
                        }
                    }
                    $("#wIssue").html(sIssue);
                }
            });
        },
        // 获取开奖期次
        getPrizeInfo: function() {
            var _this = this, sUrl = "/lottery/hisnumberzucai.action.action?lotteryId=" + _this.oldId + "&issueLen=20&d=" + _sf.getTimeStamp();
            $.get(sUrl, function(data) {
                var oArr = _JSON.parse(data);
                _this.readerPrizeInfo(oArr[0].gameIssueName);
            });
        },
        // 渲染开奖信息
        readerPrizeInfo: function(issue) {
            var _this = this, lotteryId2 = _this.lotId, sendUrl = "/lottery/hisnumberissue.action?lotteryId1=" + _this.oldId + "&issue=" + issue + "&lotteryId2=" + lotteryId2 + "&d=" + _sf.getTimeStamp();
            $.get(sendUrl, function(data) {
                var obj = _JSON.parse(data)[0];
                var html = "", arr = "", sMoney = "";
                if (!obj.saleSummoney) {
                    // 取不到开奖数据
                    return false;
                }
                html += '<span class="showNum info">' + issue + "期开奖信息：";
                sMoney = obj.saleSummoney.split(",");
                // 销售额
                if (lotteryId == "301" && sMoney.length > 1) {
                    obj.saleSummoney && (html += " 销售额:<strong>" + _this.numFormat(obj.saleSummoney.split(",")[1]) + "</strong>元，");
                } else {
                    obj.saleSummoney && (html += " 销售额:<strong>" + _this.numFormat(obj.saleSummoney.split(",")[0]) + "</strong>元，");
                }
                // 中奖注数和金额
                if (obj.pageandmoney) {
                    arr = obj.pageandmoney.split(",");
                    // // 3-2228216,186-15402,1833-3639
                    if (lotteryId2 == "300") {
                        html += "一等奖:<strong>" + _this.numFormat(arr[0].split("-")[0]) + "</strong>注  <strong>" + _this.numFormat(arr[0].split("-")[1]) + "</strong>元&nbsp;&nbsp;";
                        html += "二等奖:<strong>" + _this.numFormat(arr[1].split("-")[0]) + "</strong>注  <strong>" + _this.numFormat(arr[1].split("-")[1]) + "</strong>元";
                    } else if (lotteryId2 == "301") {
                        html += "中奖注数:<strong>" + _this.numFormat(arr[2].split("-")[0]) + "</strong>注  <strong>" + _this.numFormat(arr[2].split("-")[1]) + "</strong>元";
                    } else if (lotteryId2 == "302" || lotteryId2 == "303") {
                        html += "中奖注数:<strong>" + _this.numFormat(arr[0].split("-")[0]) + "</strong>注  <strong>" + _this.numFormat(arr[0].split("-")[1]) + "</strong>元";
                    }
                }
                obj.pondOfLottery && (html += " 滚存到下期:<strong>" + _this.numFormat(obj.pondOfLottery) + "</strong>元</span>");
                $("#lastPeriodWin").html(html);
            });
        },
        // 格式化日期
        numFormat: function(num) {
            if (!num) return "-";
            if (num == 0) return 0;
            return parseInt(num).toLocaleString().split(".")[0];
        },
        /******************** 渲染对阵 *******************/
        // 获取对阵数据
        getRaceData: function(issue) {
            var _this = this, oc = this.args, oldId = oc[lotteryId].oldId, urlStr = "/lottery/zcplayvs.action?lotteryId=" + oldId + "&issue=" + issue + "&v=" + new Date().getTime();
            $.get(urlStr, function(data) {
                var oData;
                oData = _JSON.parse(data);
                _this.renderRace(oData);
            });
        },
        // 渲染对阵信息
        renderRace: function(data) {
            var _this = this;
            if (!data) {
                return false;
            }
            var sRaceHtml = "", oMatchInfo = _this.matchInfo = data.matchInfo;
            for (var i = 0, len = oMatchInfo.length; i < len; i++) {
                var od = oMatchInfo[i], n1 = i * 2, n2 = i * 2 + 1, sStartTime = _CPB.str.formatDate(od.gameStartDate), oEuropeArr = od.europeSp.split(" "), sClsQuan = "quan", trCls = "beginBet";
                if (i % 2) {
                    trCls = "beginBet oddBeginBet";
                }
                if (!_this.fs) {
                    sClsQuan = "quan tgr";
                }
                // 联赛信息
                var lsInfo = "";
                if (_this.matchURI.hasOwnProperty(od.leageName)) {
                    lsInfo = '<a href="' + _this.matchURI[od.leageName] + '" >' + od.leageName + "</a>";
                } else {
                    lsInfo = od.leageName;
                }
                // 处理中立场 playid 中有横杠
                var isZlc = false;
                if (od.playId.indexOf("-") != -1) {
                    od.playId = od.playId.replace("-", "");
                    isZlc = true;
                }
                if (lotteryId == "303") {
                    // 四场进球
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 b-l r-s">' + '   <div class="tfr">' + '       <span> 主：<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></span>" + "   </div>" + "   <div>" + '       <span>客：<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a></span>" + "    </div>" + "</td>" + '<td class="wh-8 b-l xh">' + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + n1 + '_0">0</a><a href="javascript:;" class="n" id="n_' + n1 + '_1">1</a><a href="javascript:;" class="n" id="n_' + n1 + '_2">2</a><a href="javascript:;" class="n" id="n_' + n1 + '_3">3+</a>';
                    } else {
                        sRaceHtml += '<span class="ys4">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "   <hr>" + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + n2 + '_0">0</a><a href="javascript:;" class="n" id="n_' + n2 + '_1">1</a><a href="javascript:;" class="n" id="n_' + n2 + '_2">2</a><a href="javascript:;" class="n" id="n_' + n2 + '_3">3+</a>';
                    } else {
                        sRaceHtml += '<span class="ys4">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + n1 + '" style="display:block;cursor:pointer;">全</span><hr>' + '   <span class="' + sClsQuan + '" id="quan_' + n2 + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + ' <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + n1 + '" style="display:block;cursor:pointer;">全</span><hr>' + '   <span class="' + sClsQuan + '" id="quan_' + n2 + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + _this.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                } else if (lotteryId == "302") {
                    // 六场半全
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <span><i>" + (n1 + 1) + "</i></span><hr><span>" + (n2 + 1) + "</span>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></td>" + '<td class="wh-5">VS</td>' + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>"+ _this.parsePh(od.guestPh) +"</td>" + '<td class="wh-10 b-l"><span>半场</span><hr><span>全场</span></td>' + '<td class="wh-8 b-l xh">' + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + n1 + '_3">3</a><a href="javascript:;" class="n" id="n_' + n1 + '_1">1</a><a href="javascript:;" class="n" id="n_' + n1 + '_0">0</a>';
                    } else {
                        sRaceHtml += '<span class="ys">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "   <hr>" + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + n2 + '_3">3</a><a href="javascript:;" class="n" id="n_' + n2 + '_1">1</a><a href="javascript:;" class="n" id="n_' + n2 + '_0">0</a>';
                    } else {
                        sRaceHtml += '<span class="ys">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + n1 + '" style="display:block;cursor:pointer;">全</span><hr>' + '   <span class="' + sClsQuan + '" id="quan_' + n2 + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + n1 + '" style="display:block;cursor:pointer;">全</span><hr>' + '   <span class="' + sClsQuan + '" id="quan_' + n2 + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + _this.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                } else if (lotteryId == "301") {
                    // 任九
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <i>" + (i + 1) + "</i>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></td>" + '<td class="wh-5">VS</td>' + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>"+ _this.parsePh(od.guestPh) +"</td>" + '<td class="wh-8 b-l xh">' + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + i + '_3">3</a><a href="javascript:;" class="n" id="n_' + i + '_1">1</a><a href="javascript:;" class="n" id="n_' + i + '_0">0</a>';
                    } else {
                        sRaceHtml += '<span class="ys">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + i + '" style="display:block;cursor:pointer;">全</span><hr>' + "</td>" + '<td><input type="checkbox" value="' + i + '" class="dan" id="dan_' + i + '"></td>' + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + i + '" style="display:block;cursor:pointer;">全</span><hr>' + "</td>" + '<td><input type="checkbox" value="' + i + '" class="dan" id="dan_' + i + '"></td>' + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + _this.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                } else if (lotteryId == "300") {
                    // 14场胜负
                    sRaceHtml += '<tr id="tr_' + od.playId + '" class="' + trCls + '">' + '<td class="wh-1">' + "   <i>" + (i + 1) + "</i>" + "</td>" + '<td class="wh-2 b-l">' + "  <span>" + lsInfo + "</span>" + "</td>" + '<td class="wh-3">' + sStartTime + "</td>" + '<td class="wh-4 t-r r-l">' + _this.parsePh(od.homePh) + '<a href="http://saishi.zgzcw.com/soccer/team/' + od.legageId + '/' + od.hostId + '"  title="' + od.hostNameFull + '">' + od.hostName + "</a></td>" + '<td class="wh-5">VS</td>' + '<td class="wh-6 t-l r-r"><a href="http://saishi.zgzcw.com/soccer/team/'+ od.legageId + '/' + od.guestId + '"  title="' + od.guestNameFull + '">' + od.guestName + "</a>"+ _this.parsePh(od.guestPh) +"</td>" + '<td class="wh-8 b-l xh">' + '   <div class="bets-area">';
                    if (_this.fs) {
                        sRaceHtml += '<a href="javascript:;" class="n" id="n_' + i + '_3">3</a><a href="javascript:;" class="n" id="n_' + i + '_1">1</a><a href="javascript:;" class="n" id="n_' + i + '_0">0</a>';
                    } else {
                        sRaceHtml += '<span class="ys">未开售</span>';
                    }
                    sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + i + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td style="width:100px;" class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>'+ '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/zjyc" class="sj" data-zlc="' + isZlc + '" >'+(od.orderCount>0?'<span style="color:red;">'+od.orderCount+'</span>':'')+'推荐</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">暂无数据</td>' + "</tr>";
                    //sRaceHtml += "   </div>" + "</td>" + '<td class="wh-9">' + '   <span class="' + sClsQuan + '" id="quan_' + i + '" style="display:block;cursor:pointer;">全</span>' + "</td>" + '<td class="wh-10 b-l sp" oldplayid="0" newplayid="' + od.playId + '">' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/ypdb" class="sj" data-zlc="' + isZlc + '" >亚</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bjop" class="sj" data-zlc="' + isZlc + '" >欧</a>' + '   <a href="javascript:;" data-href="http://fenxi.zgzcw.com/' + od.playId + '/bfyc" class="sj" data-zlc="' + isZlc + '" >析</a>' + "</td>" + '<td class="wh-11 b-l">' + '   <div class="oupei-area" mid="' + od.playId + '" rel="9"><span>' + oEuropeArr[0] + '</span><span class="mid">' + oEuropeArr[1] + "</span><span>" + oEuropeArr[2] + "</span></div>" + "</td>" + '<td class="wh-15 b-l">' + _this.makeTzbl(od.renqiInfo) + "</td>" + "</tr>";
                }
            }
            $("#zcList").html(sRaceHtml);
            // 如果是复式看一下是否是返回修改
            var sUrl = _CPB.str.queryUrl(location.href, "nav");
            if (sUrl != "yt") {
                try {
                    var isEdit = $.cookie("zcBackEdit");
                    // 返回修改
                    var isDetailed = $.cookie("zcDetailed");
                    // 抄单
                    if (isEdit) {
                        zcBuy.isBackEdit();
                    } else if (isDetailed) {
                        zcBuy.isDetailed();
                    }
                } catch (e) {}
            }
        },
        // 解析球队排名，并返回html
        parsePh: function(ph) {
            if (ph == "" || ph.split("|").length != 3) {
                return "";
            } else {
                var p = ph.split("|");
                if (p[1] == "-") {
                    return '<em class="pm oneDat" _r="1">[' + p[0] + "]</em>";
                } else if (p[2] == "-") {
                    return '<em class="pm" _r="1">[' + p[0] + "]<br /><i>" + p[1] + "</i></em>";
                } else {
                    return '<em class="pm" _r="1">[' + p[0] + ']<br /><i title="' + p[2] + '">' + p[1] + "</i></em>";
                }
            }
        },
        // 解析投注比例，并返回html
        makeTzbl: function(rqInfo) {
            var _this = this, str = "";
            if (rqInfo) {
                var hastz = true, // 如果没有投注，则不显示比例条
                isTworows = _this.lotId.charAt(2) > 1, // 十四场和任九是单行，六场和四场是两行
                isFour = _this.lotId.charAt(2) == 3 ? "4" : "3";
                // 每行三个投注选项的与每行四个投注选项
                if (rqInfo.replace(/(0\.00%)/gi, " ").replace(/ /gi, "") == "") {
                    hastz = false;
                    rqInfo = rqInfo.replace(/(0\.00%)/gi, "-");
                }
                var xarr = rqInfo.split(" "), xf = "", xs = "", yf = "", ys = "", yarr = _this.comWitdh(xarr);
                for (var i = 0, len = xarr.length; i < len; i++) {
                    if (isTworows && i >= xarr.length / 2) {
                        xs += "<li>" + xarr[i] + "</li>";
                        ys += '<li class="' + _this.colorful[i - xarr.length / 2] + '" style="width:' + yarr[i] + '"></li>';
                    } else {
                        xf += "<li>" + xarr[i] + "</li>";
                        yf += '<li class="' + _this.colorful[i] + '" style="width:' + yarr[i] + '"></li>';
                    }
                }
                isTworows && (str += "<span>");
                str += '<ul class="rq_chart_new rq_rate_new' + isFour + '">' + xf + "</ul>";
                hastz && (str += '<ul class="rq_chart_new">' + yf + "</ul>");
                if (isTworows) {
                    str += '</span><hr /><span><ul class="rq_chart_new rq_rate_new' + isFour + '">' + xs + "</ul>";
                    hastz && (str += '<ul class="rq_chart_new">' + ys + "</ul>");
                    str == "</span>";
                }
            }
            return str;
        },
        // 返回所占比例
        comWitdh: function(arr) {
            var w = 164;
            return $.map(arr, function(n) {
                var t = (w * parseFloat(n) / 100).toFixed(2);
                return Math.max(t, 1) + "px";
            });
        },
        // 提示窗口
        alertBox: function(val, msg, url, buyType, sid) {
            var _this = this;
            var age = {
                "0": {
                    msg: "<span class='tbe'>恭喜您，您的方案已经成功提交！</span>",
                    show: 1,
                    cz: 1
                },
                "0000": {
                    msg: "恭喜您，您的方案已经成功提交！",
                    show: 1,
                    cz: 1
                },
                "0001": {
                    msg: "您的方案已保存，但余额不足，是否<a href='/usercenter/accmanage/charge.jsp' target='_blank'>立即充值</a>？",
                    show: 1,
                    cz: 1
                },
                "1000": {
                    msg: "您的方案已经保存成功！",
                    show: 1,
                    cz: 10
                },
                "2002": {
                    msg: "该方案已成功提交，是否再次提交？",
                    show: 2,
                    cz: 6
                },
                "5": {
                    msg: "没有发现上传文件",
                    show: 2,
                    cz: 3
                },
                "1": {
                    msg: "用户未登录",
                    show: 2,
                    cz: 5
                },
                "1202": {
                    msg: "扣款失败,是否<a href='/usercenter/accmanage/charge.jsp' target='_blank'>立即充值</a>？",
                    show: 2,
                    cz: 3
                },
                "8": {
                    msg: "上传文件格式错误",
                    show: 2,
                    cz: 3
                },
                "0301": {
                    msg: "充值不足,是否<a href='/usercenter/accmanage/charge.jsp' target='_blank'>立即充值</a>？",
                    show: 2,
                    cz: 2
                },
                "0501": {
                    msg: "您的投注期次已截期",
                    show: 2,
                    cz: 4
                },
                "0502": {
                    msg: "您的投注期次不存在",
                    show: 2,
                    cz: 3
                },
                "0503": {
                    msg: "您的账户已被锁定",
                    show: 2,
                    cz: 3
                },
                "0504": {
                    msg: "此方案已经撤销",
                    show: 2,
                    cz: 0
                },
                "0505": {
                    msg: "您上传的方案格式有误",
                    show: 2,
                    cz: 3
                },
                "0507": {
                    msg: "本期未开售",
                    show: 2,
                    cz: 3
                },
                "0508": {
                    msg: "很抱歉，您的方案提交失败",
                    show: 0,
                    cz: 0
                },
                "0510": {
                    msg: "暂无此期次",
                    show: 2,
                    cz: 3
                },
                "0511": {
                    msg: "您的投注期次已截期",
                    show: 2,
                    cz: 3
                },
                "0528": {
                    msg: "每期只能发起2个包买包赔方案",
                    show: 2,
                    cz: 1
                },
                "0529": {
                    msg: "包买包赔方案金额不能大于10000",
                    show: 2,
                    cz: 1
                },
                "0528": {
                    msg: "每期只能发起2个包买包赔方案",
                    show: 2,
                    cz: 1
                },
                "0529": {
                    msg: "包买包赔方案金额不能大于10000",
                    show: 2,
                    cz: 1
                },
                "9999": {
                    msg: "系统未知异常",
                    show: 2,
                    cz: 0
                },
                "333": {
                    msg: "战团用户不能发起合买",
                    show: 2,
                    cz: 0
                },
                "444": {
                    msg: "战团用户不能进行战团结束之后的追号",
                    show: 2,
                    cz: 0
                },
                "4444": {
                    msg: "短信系统设备调试，该彩种暂停销售。",
                    show: 2,
                    cz: 3
                }
            }, obj = age[val] || {
                msg: "因网络原因，方案提交失败！",
                show: 2,
                cz: 0
            }, fn;
            var des = age[val] ? obj.msg : msg || obj.msg, // 提示信息
            res = "" + des + "<p>", jf, str = "", hdStr = "", hdUrl = "", lotteryId = lotteryId;
            // 彩种id;
            if (document.domain.indexOf("diyicai.com") > -1) {
                hdUrl += "http://www.diyicai.com/huodong/song10/index.html";
            } else {
                hdUrl += "http://www.zgzcw.com/huodong/song10/index.html";
            }
            hdStr += "";
            //'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="'+hdUrl+'" class="tu" style="color:blue"  >报名参加首次购彩不中返本金活动</a>';
            /*
                // 显示积分27 为网站用户
                if(sid != "27"){

                    if(buyType == 0 || buyType == 9){
                        jf = $("#buyAmount").val();
                        str += '<br/>'+hdStr+'<br/><b>温馨提示：</b>方案满员后您将获得<strong style="color:red">'+jf+'积分</strong>';
                    }
                    else{
                        jf = sum;
                        str += '<br/>'+hdStr+'<br/><b>温馨提示：</b>方案正常出票后您将获得<strong style="color:red">'+jf+'积分</strong>';
                    }
                }
*/
            //  str +='<br/><b>出票时间：</b><strong style="color:red">'+ cpTime +'</strong>';
            if (obj.cz == 1) {
                // 成功
                if (!!+_this.fee) {
                    res += '您可以<a href="javascript:;" class="tu goonBuy" id="goonBuy">继续投注</a>，或者可以前往<a href="/uc/betmanage/betprosave.action" class="tu" >保存的方案</a>查看该方案。';
                } else if (buyType) {
                    //预投
                    if (buyType == 9) {
                        res += '您可以前往 <a href="/lottery/getproject.action?lotteryId=' + lotteryId + '&tabId=1" class="tu tzgbBn" > 方案列表 </a> 或 <a href="/uc/betmanage/betrecord.action" class="tu" >投注记录</a> 查看该单式方案。';
                    } else {
                        res += '<p>温馨提示：请务必在本期投注截止前上传方案。</p>您可以<a href="javascript:;" class="tu goonBuy" id="goonBuy">继续投注</a>，也可以前往 <a href="/lottery/getproject.action?lotteryId=' + lotteryId + '&tabId=1" class="tu tzgbBn" > 方案列表 </a> 或 <a href="/uc/betmanage/betrecord.action" class="tu" >投注记录</a> 查看该预投方案。';
                    }
                    res += str;
                } else {
                    res += '您可以<a href="javascript:;" class="tu goonBuy" id="goonBuy">继续投注</a>，也可以前往 <a href="/lottery/getproject.action?lotteryId=' + lotteryId + '&tabId=1" class="tu tzgbBn" > 方案列表 </a> 或 <a href="/uc/betmanage/betrecord.action" class="tu" >投注记录</a> 查看该方案。' + str + "";
                }
            } else if (obj.cz == 4) {
                res += '您可以<span class="tb">选择下一期再投</span>，也可以去<a href="/" class="tu">购彩大厅</a>试试其他彩种！';
            } else if (obj.cz == 5) {
                res += '如果您已经是注册用户，请您点击这里<a class="tu bet_login" href="javascript:;">登录</a>后再投注，<br/>如果您尚未注册，点击这里<a href="/login.jsp"  class="tu">免费注册</a>。';
                fn = function() {
                    $(".bet_login").unbind().bind("click", function() {
                        $.alertClose();
                        showLoginDiv("/lottery/common/login.jsp");
                    });
                    $("#nowBuy").val("尚未登录");
                };
            } else if (obj.cz == 6) {
                //重复提交
                res += "";
            } else if (obj.cz == 10) {
                //保存方案
                res += '您可以<a href="/uc/betmanage/betprosave.action" >查看已经保存的方案列表</a>。';
            } else {
                res += '您可以<span class="tb">稍后再投</span>，也可以去<a href="/" class="tu">购彩大厅</a>试试其他彩种！';
            }
            res += "</p>";
            $("#matchesTr").hide();
            if (obj.cz == 1) {
                if (_this.fee > 0) {
                    // 余额不足
                    var callbk = function() {
                        if (typeof url != "undefined") {
                            window.location.href = url;
                        } else {
                            window.location.reload();
                        }
                        return false;
                    };
                    $.confirm(res, callbk);
                } else {
                    refreshMoney();
                    $.alertOk(res, function() {
                        if (buyType == 9) {
                            //预投继续投注关闭
                            window.opener = null;
                            window.open("", "_self");
                            window.close();
                        }
                        return false;
                    });
                }
                fn = function() {
                    $(".goonBuy").unbind().bind("click", function() {
                        // 继续重新投注
                        if (_this.tzUrl) {
                            location.href = _this.tzUrl;
                        } else {
                            location.reload();
                        }
                    });
                };
            } else if (obj.cz == 6) {
                var callbk = function() {
                    _this.randId = _CPB.sf.getTimeStamp();
                    $("#nowBuy").trigger("click");
                    return false;
                };
                $.confirm(res, callbk);
            } else if (obj.cz == 10) {
                // 保存方案
                $.alertOk(res);
            } else {
                $.alert(res);
            }
            if ($.isFunction(fn)) {
                fn.call();
            }
        }
    };
    var zcTool = function() {
        return new ZcTool();
    };
    exports.zcTool = zcTool;
    // 调用欧赔模块
    var oddToll = window["oddToll"] = require("./zc.odd").oddAfirm;
    oddToll.init();
});
/**
 * Created with IntelliJ IDEA.
 * User: siguang
 * Date: 2015-4-13
 * Time: 上午10:10
 * To change this template use File | Settings | File Templates.
 */
define("../js/example/zc.odd", [ "lib-cpBase", "lib-json" ], function(require, exports, module) {
    var _CPB = require("lib-cpBase").CPB, _JSON = require("lib-json").JSON, oStr = _CPB.str, oCookie = _CPB.c;
    var OpAfirm = function() {
        this.opArgs = {
            europe: {
                name: "欧赔",
                ids: "get_oupan"
            },
            asian: {
                name: "亚盘",
                ids: "get_yapan"
            },
            kelly: {
                name: "凯利",
                ids: "get_kaili"
            },
            "return": {
                name: "赔付",
                ids: "get_peifulv"
            },
            probability: {
                name: "概率",
                ids: "get_gailv"
            },
            betting_ratio: {
                name: "本站投注",
                ids: "get_renqi"
            }
        };
        this.sortArgs = {
            get_oupan: [ "场次号", "主胜赔", "客胜赔", "最小赔率", "主客差值" ],
            get_yapan: [ "场次号", "主队让球", "客队让球" ],
            get_gailv: [ "场次号", "主胜概率", "平局概率", "客胜概率" ],
            get_kaili: [ "场次号", "主胜凯利", "平局凯利", "客胜凯利" ],
            get_peifulv: [ "场次号", "赔付率" ],
            get_renqi: [ "场次号", "主队比例", "客队比例", "最高比例", "比例差值" ]
        };
        this.ypFormat = {
            0: {
                s: "平手",
                l: "平手"
            },
            .25: {
                s: "平/半",
                l: "平手/半球"
            },
            .5: {
                s: "半球",
                l: "半球"
            },
            .75: {
                s: "半/一",
                l: "半球/一球"
            },
            1: {
                s: "一球",
                l: "一球"
            },
            1.25: {
                s: "一/球半",
                l: "一球/球半"
            },
            1.5: {
                s: "球半",
                l: "球半"
            },
            1.75: {
                s: "球半/两",
                l: "球半/两球"
            },
            2: {
                s: "两球",
                l: "两球"
            },
            2.25: {
                s: "两球/两半",
                l: "两球/两球半"
            },
            2.5: {
                s: "两半",
                l: "两球半"
            },
            2.75: {
                s: "两半/三",
                l: "两球半/三球"
            },
            3: {
                s: "三球",
                l: "三球"
            },
            3.25: {
                s: "三/三半",
                l: "三球/三球半"
            },
            3.5: {
                s: "三半",
                l: "三球半"
            },
            3.75: {
                s: "三半/四",
                l: "三球半/四球"
            },
            4: {
                s: "四球",
                l: "四球"
            },
            4.25: {
                s: "四/四半",
                l: "四球/四球半"
            },
            4.5: {
                s: "四半",
                l: "四球半"
            },
            4.75: {
                s: "四半/五",
                l: "四球半/五球"
            },
            5: {
                s: "五球",
                l: "五球"
            }
        };
        this.zcDUrl = "/ssc/lottery/jcsp/getzcspbyissue.jsp";
        //足彩
        this.zcMUrl = "/ssc/lottery/jcsp/getzcspbyplayId.jsp";
        this.opComp = "/ssc/lottery/jcsp/getjcspcompany.jsp";
        //获取单个公司对应的赛程数据
        this.lotId = oStr.urlHas().lotteryId;
        this.type = oStr.urlHas().type;
        this.cid = 0;
        this.spType = "europe";
        this.cacheTime = 2 * 60 * 1e3;
        //两分钟
        this.isSjSB = false;
        this.isSpSB = false;
        this.isload = false;
    };
    OpAfirm.prototype = {
        constructor: OpAfirm,
        init: function() {
            if ($(".pjopBtn:first").length) {
                var rel = $(".pjopBtn:first").attr("rel");
                this.initCompP(rel, "europe");
            }
            this.setOptCookie();
            this.bindEvent();
            return this;
        },
        bindEvent: function() {
            var _this = this;
            // 是否显示赔率走势弹层
            $("#spChange").click(function() {
                var ch = $(this).attr("checked"), id = $(this).attr("id"), t = $(this).attr("t"), key = t + "_" + id;
                if (ch) {
                    oCookie.cookie(key, 1, {
                        expires: 30,
                        path: "/"
                    });
                } else {
                    oCookie.cookie(key, null, {
                        expires: 0,
                        path: "/"
                    });
                }
            });
            // 下拉赔率菜单
            $("span.pjopBtn").unbind().live("mouseenter", function() {
                var obj = this;
                _this.pBTimer = setTimeout(function() {
                    $(obj).addClass("show");
                    var rel = $(obj).attr("rel");
                    if ($("#opData" + rel).find("li").length > 0) {
                        return false;
                    }
                    _this.setOpInfos(obj);
                    setTimeout(function() {
                        var f = $("#opData" + rel).find(":radio").first();
                        f.attr("checked", true);
                        f.trigger("mousedown");
                    }, 1500);
                }, 500);
            });
            $("span.pjopBtn").unbind().live("mouseleave", function() {
                clearTimeout(_this.pBTimer);
                $(this).removeClass("show");
            });
            // 场次号排序
            $("span.paixvBtn").unbind().live("mouseenter", function() {
                var obj = this;
                _this.pxTimer = setTimeout(function() {
                    $(obj).addClass("show");
                }, 500);
            });
            $("span.paixvBtn").unbind().live("mouseleave", function() {
                clearTimeout(_this.pxTimer);
                $(this).removeClass("show");
            });
            $(".paixvBtn").delegate("a", "click", function() {
                var tName = $(this).attr("rel"), cls = $(this).find("em").attr("class"), sFlag = cls.indexOf("up") > -1 ? 1 : 0, c = $(this).parent().attr("t"), d;
                $(".paixvBtn").find("a").find("em").removeClass("cur");
                $(this).find("em").addClass("cur");
                if (tName.indexOf("主") > -1 && tName != "主客差值") {
                    d = 0;
                } else if (tName.indexOf("平") > -1 || tName == "赔付率") {
                    d = 1;
                } else if (tName.indexOf("客") > -1 && tName != "主客差值") {
                    d = 2;
                }
                $("#pN" + c).text(tName);
                var tabArr = $(".mb");
                $.each(tabArr, function(i) {
                    var trs = $(tabArr[i]).find("tr");
                    var trsNew = trs.sort(function(a, b) {
                        var spsA, spsB;
                        if (tName == "场次号") {
                            spsA = Number($(a).find("td:eq(0) i").text()) || 0;
                            spsB = Number($(b).find("td:eq(0) i").text()) || 0;
                        } else if (tName == "最小赔率") {
                            var spA = $(a).find("td:eq(" + c + ") span");
                            var spB = $(b).find("td:eq(" + c + ") span");
                            spsA = Math.min.call(Math, $(spA[0]).text(), $(spA[1]).text(), $(spA[2]).text()) || 0;
                            spsB = Math.min.call(Math, $(spB[0]).text(), $(spB[1]).text(), $(spB[2]).text()) || 0;
                        } else if (tName == "主客差值") {
                            var spA = $(a).find("td:eq(" + c + ") span");
                            var spB = $(b).find("td:eq(" + c + ") span");
                            spsA = Math.abs($(spA[0]).text() - $(spA[2]).text()) || 0;
                            spsB = Math.abs($(spB[0]).text() - $(spB[2]).text()) || 0;
                        } else {
                            spsA = $($(a).find("td:eq(" + c + ") span")[d]).text() || 0;
                            spsB = $($(b).find("td:eq(" + c + ") span")[d]).text() || 0;
                        }
                        if (sFlag) {
                            return Number(spsA) - Number(spsB);
                        } else {
                            return Number(spsB) - Number(spsA);
                        }
                    });
                    $(".mb").eq(i).empty().html(trsNew);
                });
                // 重新显示表背景颜色
                tabArr.find("tr").attr("class", "");
                $.each(tabArr.find("tr"), function(k, v) {
                    var clsName = "beginBet";
                    if (k % 2) {
                        clsName = "beginBet oddBeginBet";
                    }
                    $(this).addClass(clsName);
                });
            });
            // 选择一个赔率公司的数据
            $(".opData").delegate("label", "mousedown", function() {
                var box = $(this).find("input"), t = box.attr("t"), p = box.attr("p"), v = box.val(), ids = box.attr("rel"), d = $(this).parent().parent().attr("d");
                $("#comp" + d).html(v).attr("cid", p).attr("t", t);
                _this.createPx(d, ids);
                _this.getOpDate(t, p, d);
            });
            // 数据列区域 --进入
            $("div.oupei-area").unbind().live("mouseenter", function(e) {
                var obj = this;
                clearTimeout(_this.SjTimer);
                _this.SjTimer = setTimeout(function() {
                    _this.isSjSB = true;
                    _this.setSjShowBonus(obj, e);
                }, 500);
            });
            // 数据列区域 --移动
            $("div.oupei-area").unbind().live("mousemove", function(e) {
                if (!_this.isSjSB) return false;
                var obj = $(this);
                var r = obj.attr("rel"), comp = $("#comp" + r).attr("t");
                if (comp != "europe" && comp != "asian") return false;
                _this.setSpDivPostion(e, 1);
            });
            $("div.oupei-area").unbind().live("mouseleave", function() {
                _this.isSjSB = false, _this.isSpSB = false;
                clearTimeout(_this.SjTimer), clearTimeout(_this.SpTimer);
                _this.setHideBonus();
            });
        },
        /********************** 赔率下拉菜单 ***********************/
        // 初始化赔率菜单 @param：玩法的标签id，rel属性，@param：赔率公司kelly、asian、europe
        initCompP: function(n, t) {
            var c = $("#opData" + n);
            // 赔率菜单Id
            this.setOpInfos(c.parent().parent());
            setTimeout(function() {
                var f = c.find("[t=" + t + "]").first();
                f.attr("checked", true);
                f.trigger("mousedown");
            }, 1500);
        },
        // 获取赔率菜单数据，并将数据加载到菜单中
        setOpInfos: function(obj) {
            var _this = this, rel = $(obj).attr("rel");
            $.ajax({
                url: this.opComp,
                type: "post",
                data: [],
                success: function(res) {
                    var temp = _JSON.parse(res);
                    if ($.isEmptyObject(temp)) return false;
                    var str = _this.createComp(temp, rel);
                    $("#opData" + rel).empty().html(str);
                    _this.isload = true;
                },
                error: function() {}
            });
        },
        // 将赔率菜单数据转HTML
        createComp: function(temp, rel) {
            var comHtml = "";
            for (var i in temp) {
                if (i == "smg" || i == "betting_ratio") continue;
                if (i != "length") {
                    comHtml += "<li><em>" + this.opArgs[i]["name"] + "</em>";
                    for (var j in temp[i]) {
                        if (j != "length") {
                            comHtml += '<label><input type="radio" t=' + i + " p=" + j + " rel=" + this.opArgs[i]["ids"] + "  value=" + temp[i][j] + "  name=xht" + rel + ">" + temp[i][j] + "</label>";
                        }
                    }
                    comHtml += "</li>";
                }
            }
            return comHtml;
        },
        /************************ 变盘走势 ************************/
        setOptCookie: function() {
            var _this = this, sp = $("#spChange"), id = sp.attr("id"), t = sp.attr("t"), // sp值变盘走势
            spFlag = oCookie.cookie(t + "_" + id) ? true : false;
            // 查看cookie中是否选中显示赔率选项
            $("#spChange").attr("checked", spFlag);
            // 数据列一二三
            var lables = $("li.sh label:gt(0)"), n = 1;
            $.each(lables, function(i) {
                var box = $(lables[i]).find("input:checkbox"), id = box.attr("id"), t = box.attr("t");
                var f = oCookie.cookie(t + "_" + id) ? true : false;
                if (f) n++;
                box.attr("checked", f);
                _this.setSJL(n);
            });
        },
        setSJL: function(n) {
            var cls = n == 1 ? "tz-wap" : n == 2 ? "tz-wap sheet-2" : "tz-wap sheet-3", rel;
            if ($("#filterSpf").attr("checked")) {
                cls += " rqfrq";
            }
            $("#tw").attr("class", cls);
            if (cls.indexOf("sheet-2") > -1) {
                rel = $(".pjopBtn:eq(1)").attr("rel");
                this.initCompP(rel, "asian");
            } else if (cls.indexOf("sheet-3") > -1) {
                rel = $(".pjopBtn:eq(2)").attr("rel");
                this.initCompP(rel, "kelly");
            }
        },
        /************************ SP变化弹层 ************************/
        // 展开赔率变化菜单
        setSjShowBonus: function(obj, eV) {
            var _this = this, flag = $("#spChange").attr("checked"), n = $(obj).attr("rel"), data = $(obj).data("data"), comp = $("#comp" + n).attr("t");
            // 是否是欧赔或亚盘的区域
            if (comp != "europe" && comp != "asian") {
                $("div.bonusWap,div.bonus").hide();
                return false;
            }
            // 是否显示
            if (flag) {
                $("#spName").text($("#comp" + n).text());
                // 没有缓存数据
                if (!data) {
                    _this.getSpsChangeDate(obj);
                } else {
                    if (data == 2) {
                        $("div.bonusWap,div.bonus").hide();
                        return false;
                    }
                    var spStr = _this.createSpLi_zc(data);
                    $("#spInfos").html(spStr);
                }
                _this.setSpDivPostion(eV, 1);
            }
        },
        // 数据列
        getSpsChangeDate: function(obj) {
            var _this = this, t, dt, mid = $(obj).attr("mid"), rel = $(obj).attr("rel"), cid = $("#comp" + rel).attr("cid"), sptype = $("#comp" + rel).attr("t"), aLen = $(obj).find("span").length;
            if (aLen < 3) return false;
            var url, pid;
            if (!lotteryId) return false;
            if (lotteryId == 201 || lotteryId == 202 || lotteryId == 47) {
                url = _this.jcMUrl, t = $("#selectissue").val();
                pid = $(obj).attr("pid");
                dt = {
                    cid: cid,
                    matchId: mid,
                    sptype: sptype,
                    date: t
                };
            } else if (lotteryId == 400) {
                t = $("#selectissue").val();
                url = _this.bdMUrl;
                dt = {
                    cid: cid,
                    matchId: mid,
                    sptype: sptype,
                    issue: t,
                    lottery: lotteryId
                };
            } else {
                var lotId = lotteryId == "301" ? "300" : lotteryId;
                t = zcTool.curIssue;
                url = _this.zcMUrl;
                dt = {
                    cid: cid,
                    playid: mid,
                    sptype: sptype,
                    issue: t,
                    lottery: lotId
                };
            }
            $.ajax({
                url: url,
                type: "post",
                data: dt,
                success: function(res) {
                    var spObj = $(obj);
                    if (!$.trim(res)) {
                        spObj.data("data", 2);
                        (function(o) {
                            setTimeout(function() {
                                $(o).data("data", 0);
                            }, _this.cacheTime);
                        })(spObj);
                        return false;
                    }
                    var da = _JSON.parse(res);
                    var spStr = "", dlen = da.length;
                    if (!dlen) {
                        spObj.data("data", 2);
                        return false;
                    } else {
                        spObj.data("data", da);
                    }
                    (function(o) {
                        setTimeout(function() {
                            $(o).data("data", 0);
                        }, _this.cacheTime);
                    })(spObj);
                    if (!dlen) return false;
                    spStr += _this.createSpLi_zc(da);
                    $("#spInfos").empty().html(spStr);
                },
                error: function() {}
            });
        },
        setSpDivPostion: function(e, bp) {
            var lot = oStr.urlHas().lotteryId || "", dg = lot.indexOf("_dg") > -1 ? false : true, ch = $("#spChange").prop("checked"), bbDiv = $("div.bonusWap,div.bonus");
            if (!dg || !ch) {
                bbDiv.hide();
                return false;
            }
            var win = $(window), bw = $("div.bonusWap"), w = bw.width(), h = bw.height(), wh = win.height(), sTop = win.scrollTop(), sLeft = win.scrollLeft(), top = 0, left = 0;
            left = e.clientX - w / 2 + 160 + (bp ? -310 : 0) + sLeft;
            top = e.clientY;
            if (e.clientY > wh / 2) {
                top = top - h + sTop;
            } else {
                top = top + 10 + sTop;
            }
            $("div.bonusWap").css({
                left: left,
                top: top
            });
            bbDiv.show();
        },
        // 返回SP值的变化数据
        createSpLi_zc: function(arr) {
            var t = arr[0], tL = t.length;
            if (tL == 0) {
                return false;
            }
            if (tL == 6) {
                t.splice(-3);
            }
            var len = arr.length, i, strHtml = "", strC = "";
            var fl = len > 5 ? true : false;
            for (i = 0; i < len; i++) {
                var a = arr[i];
                if (a.length > 0) {
                    if (i == 0) {
                        strC += '<li class="spe"><span class="forSp">' + "" + '&nbsp;初</span><span class="firSp">' + a[0] + '</span><span class="secSp">' + a[1] + '</span><span class="thiSp">' + a[2] + "</span></li>";
                    } else {
                        var a2 = arr[i - 1];
                        strHtml += "<li>" + '<span class="forSp">' + (this.formatDate(a[3], 0) || "") + "</span>" + '<span class="firSp">' + a[0] + "<s class=" + this.checkSpClass(a, a2, 0) + "></s></span>" + '<span class="secSp">' + a[1] + "<s class=" + this.checkSpClass(a, a2, 1) + "></s></span>" + '<span class="thiSp">' + a[2] + "<s class=" + this.checkSpClass(a, a2, 2) + "></s></span>" + "</li>";
                    }
                }
            }
            strHtml += strC;
            return strHtml;
        },
        formatDate: function(time, n) {
            if (!time) return false;
            return time.slice(5, time.length - n).replace(/-/g, "/");
        },
        checkSpClass: function(a, b, n) {
            var cls;
            if (a[n] > b[n]) {
                cls = "s";
            } else if (a[n] < b[n]) {
                cls = "j";
            } else if (a[n] == b[n]) {
                cls = "z";
            } else {
                cls = "";
            }
            return cls;
        },
        // 隐藏SP层
        setHideBonus: function() {
            $("div.bonusWap,div.bonus").hide();
            $("#spInfos").empty();
            return false;
        },
        /************************ 赔率公司数据 ************************/
        createPx: function(n, ids) {
            if (!ids) return false;
            var pArr = this.sortArgs[ids], str = "", cls = "";
            for (var i = 0, len = pArr.length; i < len; i++) {
                var pa = pArr[i];
                if (pa == "主客差值") {
                    str += '<a href="javascript:;" rel=' + pa + ">" + pa + '<em class="down ' + cls + '"></em></a>';
                } else {
                    str += '<a href="javascript:;" rel=' + pa + ">" + pa + '<em class="up ' + cls + '"></em></a>';
                }
            }
            $("#px" + n).empty().append(str);
        },
        // 获取选中赔率公司的数据
        getOpDate: function(t, v, d) {
            var url, data, time, _this = this;
            if (!lotteryId) return false;
            if (lotteryId == 201 || lotteryId == 202 || lotteryId == 47) {
                url = _this.jcDUrl;
                time = $("#selectissue").val();
                data = {
                    cid: v,
                    sptype: t,
                    date: time
                };
            } else if (lotteryId == 400) {
                url = _this.bdDUrl;
                time = $("#selectissue").val();
                data = {
                    cid: v,
                    sptype: t,
                    issue: time,
                    lottery: lotteryId
                };
            } else {
                var lotId = lotteryId == "301" ? "300" : lotteryId;
                url = _this.zcDUrl;
                time = zcTool.curIssue;
                data = {
                    cid: v,
                    sptype: t,
                    issue: time,
                    lottery: lotId
                };
            }
            $.ajax({
                url: url,
                type: "post",
                data: data,
                success: function(res) {
                    var arr = _JSON.parse(res);
                    if (!arr.length) return false;
                    _this.setSpInfos(arr, d, t);
                },
                error: function() {}
            });
        },
        // 赔率公司数据渲染到页面
        setSpInfos: function(arr, d, t) {
            var len = arr.length, i;
            for (i = 0; i < len; i++) {
                var mid = lotteryId == 201 || lotteryId == 400 || lotteryId == 47 ? arr[i]["MATCHID"] : arr[i]["PLAYID"];
                var sp = arr[i]["SP"];
                if (mid) {
                    var spArr = _JSON.parse(sp);
                    if (!spArr.length) return false;
                    spArr = spArr.length > 3 ? spArr.slice(-3) : spArr;
                    var td = $("#tr_" + mid).find("td").eq(d);
                    for (var l = 0, ll = spArr.length; l < ll; l++) {
                        if (t == "asian" && l == 1) {
                            var yp = Number(spArr[l]), s = "", lg = "";
                            if (yp > 0) {
                                s = "受让", lg = "受让";
                            }
                            yp = Math.abs(yp);
                            s += this.ypFormat[yp].s;
                            lg += this.ypFormat[yp].l;
                            td.find("span").eq(l).html(s);
                        } else {
                            td.find("span").eq(l).html(spArr[l]).removeAttr("title");
                        }
                    }
                }
            }
        }
    };
    var oddAfirm = new OpAfirm();
    exports.oddAfirm = oddAfirm;
});