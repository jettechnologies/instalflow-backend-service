import Handlebars from "handlebars/runtime";

const templates = {};

templates["order-cancelled"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <title>Order Cancelled</title>\n    <style>\n        body { font-family: 'Inter', sans-serif; color: #2d3748; padding: 20px; }\n        .card { max-width: 600px; margin: auto; border: 1px solid #fed7d7; border-radius: 8px; padding: 30px; }\n    </style>\n</head>\n<body>\n    <div class=\"card\">\n        <h1 style=\"color: #c53030;\">Order Cancelled</h1>\n        <p>Your order #"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"orderId") || (depth0 != null ? lookupProperty(depth0,"orderId") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"orderId","hash":{},"data":data,"loc":{"start":{"line":14,"column":23},"end":{"line":14,"column":34}}}) : helper)))
    + " has been cancelled as requested or due to a system restriction.</p>\n        <p>If you believe this is an error, please contact our support team immediately.</p>\n    </div>\n</body>\n</html>\n";
},"useData":true});

templates["order-confirmation"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <title>Order Confirmation</title>\n    <style>\n        body { font-family: 'Inter', sans-serif; color: #2d3748; padding: 20px; }\n        .card { max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; }\n        .status { color: #38a169; font-weight: 700; text-transform: uppercase; font-size: 14px; }\n    </style>\n</head>\n<body>\n    <div class=\"card\">\n        <div class=\"status\">Payment Confirmed</div>\n        <h1>Order #"
    + alias4(((helper = (helper = lookupProperty(helpers,"orderId") || (depth0 != null ? lookupProperty(depth0,"orderId") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"orderId","hash":{},"data":data,"loc":{"start":{"line":15,"column":19},"end":{"line":15,"column":30}}}) : helper)))
    + "</h1>\n        <p>Thank you for your purchase. Your payment for the installment has been successfully processed.</p>\n        <div style=\"background: #f7fafc; padding: 15px; border-radius: 4px;\">\n            <strong>Amount Paid:</strong> "
    + alias4(((helper = (helper = lookupProperty(helpers,"amount") || (depth0 != null ? lookupProperty(depth0,"amount") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"amount","hash":{},"data":data,"loc":{"start":{"line":18,"column":42},"end":{"line":18,"column":52}}}) : helper)))
    + "<br>\n            <strong>Date:</strong> "
    + alias4(((helper = (helper = lookupProperty(helpers,"date") || (depth0 != null ? lookupProperty(depth0,"date") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"date","hash":{},"data":data,"loc":{"start":{"line":19,"column":35},"end":{"line":19,"column":43}}}) : helper)))
    + "\n        </div>\n        <p>You can view your installment schedule in the <a href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"dashboard_url") || (depth0 != null ? lookupProperty(depth0,"dashboard_url") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"dashboard_url","hash":{},"data":data,"loc":{"start":{"line":21,"column":66},"end":{"line":21,"column":83}}}) : helper)))
    + "\">dashboard</a>.</p>\n    </div>\n</body>\n</html>\n";
},"useData":true});

templates["order-status-update"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <title>Status Update</title>\n    <style>\n        body { font-family: 'Inter', sans-serif; color: #2d3748; padding: 20px; }\n        .card { max-width: 600px; margin: auto; border: 1px solid #ebf8ff; border-radius: 8px; padding: 30px; }\n        .badge { display: inline-block; padding: 4px 12px; background: #bee3f8; color: #2b6cb0; border-radius: 99px; font-size: 12px; font-weight: 700; }\n    </style>\n</head>\n<body>\n    <div class=\"card\">\n        <h1>Update on Order #"
    + alias4(((helper = (helper = lookupProperty(helpers,"orderId") || (depth0 != null ? lookupProperty(depth0,"orderId") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"orderId","hash":{},"data":data,"loc":{"start":{"line":14,"column":29},"end":{"line":14,"column":40}}}) : helper)))
    + "</h1>\n        <p>The status of your installment plan has changed:</p>\n        <div style=\"margin: 20px 0;\">\n            <span class=\"badge\">"
    + alias4(((helper = (helper = lookupProperty(helpers,"newStatus") || (depth0 != null ? lookupProperty(depth0,"newStatus") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"newStatus","hash":{},"data":data,"loc":{"start":{"line":17,"column":32},"end":{"line":17,"column":45}}}) : helper)))
    + "</span>\n        </div>\n        <p>Log in to your dashboard to see the latest details and upcoming due dates.</p>\n    </div>\n</body>\n</html>\n";
},"useData":true});

templates["otp-verification"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Verify Your email</title>\n    <style>\n        body { font-family: 'Inter', system-ui, sans-serif; color: #1a202c; background-color: #f7fafc; margin: 0; padding: 0; }\n        .container { max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }\n        .content { padding: 40px; text-align: center; }\n        .otp-box { background: #edf2f7; border-radius: 8px; padding: 20px; font-size: 32px; font-weight: 700; letter-spacing: 0.5em; margin: 24px 0; color: #2b6cb0; text-indent: 0.5em; }\n        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 13px; color: #a0aec0; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"content\">\n            <h2 style=\"margin-top: 0;\">Verify Your Email</h2>\n            <p>Please use the verification code below to complete your sign-up process.</p>\n            <div class=\"otp-box\">"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"otp") || (depth0 != null ? lookupProperty(depth0,"otp") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"otp","hash":{},"data":data,"loc":{"start":{"line":20,"column":33},"end":{"line":20,"column":40}}}) : helper)))
    + "</div>\n            <p style=\"font-size: 14px; color: #718096;\">This code will expire in 10 minutes. If you didn't request this, you can safely ignore this email.</p>\n        </div>\n        <div class=\"footer\">\n            &copy; 2026 Instalflow Platform.\n        </div>\n    </div>\n</body>\n</html>\n";
},"useData":true});

templates["password-reset"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Reset Your Password</title>\n    <style>\n        body { font-family: 'Inter', system-ui, sans-serif; color: #1a202c; background-color: #f7fafc; margin: 0; padding: 0; }\n        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }\n        .header { background: #2d3748; padding: 30px; text-align: center; }\n        .content { padding: 40px; }\n        .button { display: inline-block; padding: 14px 28px; background-color: #e53e3e; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 24px; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"header\">\n            <h2 style=\"color: #ffffff; margin: 0;\">Password Reset Request</h2>\n        </div>\n        <div class=\"content\">\n            <p>Hi "
    + alias4(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data,"loc":{"start":{"line":21,"column":18},"end":{"line":21,"column":26}}}) : helper)))
    + ",</p>\n            <p>You recently requested to reset your password for your Instalflow account. Click the button below to proceed. This link is valid for 1 hour.</p>\n            <div style=\"text-align: center;\">\n                <a href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"reset_url") || (depth0 != null ? lookupProperty(depth0,"reset_url") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"reset_url","hash":{},"data":data,"loc":{"start":{"line":24,"column":25},"end":{"line":24,"column":38}}}) : helper)))
    + "\" class=\"button\">Reset Password</a>\n            </div>\n            <p style=\"margin-top: 32px; font-size: 14px; color: #718096;\">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>\n        </div>\n    </div>\n</body>\n</html>\n";
},"useData":true});

templates["welcome"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<!DOCTYPE html>\n<html>\n<head>\n    <meta charset=\"utf-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>Welcome to Instalflow</title>\n    <style>\n        body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; color: #1a202c; background-color: #f7fafc; margin: 0; padding: 0; }\n        .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }\n        .header { background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); padding: 40px 20px; text-align: center; }\n        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }\n        .content { padding: 40px; }\n        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 14px; color: #718096; }\n        .button { display: inline-block; padding: 14px 28px; background-color: #3182ce; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 24px; transition: background 0.2s; }\n        .highlight { color: #3182ce; font-weight: 600; }\n    </style>\n</head>\n<body>\n    <div class=\"container\">\n        <div class=\"header\">\n            <h1>Welcome to Instalflow</h1>\n        </div>\n        <div class=\"content\">\n            <p>Hi <span class=\"highlight\">"
    + alias4(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data,"loc":{"start":{"line":24,"column":42},"end":{"line":24,"column":50}}}) : helper)))
    + "</span>,</p>\n            <p>We're thrilled to have you join the Instalflow community! Your account is now active and ready to help you manage your installments seamlessly.</p>\n            <p>Whether you're here to grow your business as a marketer or looking for flexible payment plans, we've got you covered.</p>\n            <a href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"dashboard_url") || (depth0 != null ? lookupProperty(depth0,"dashboard_url") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"dashboard_url","hash":{},"data":data,"loc":{"start":{"line":27,"column":21},"end":{"line":27,"column":38}}}) : helper)))
    + "\" class=\"button\">Visit Your Dashboard</a>\n            <p style=\"margin-top: 32px;\">Best regards,<br>The Instalflow Team</p>\n        </div>\n        <div class=\"footer\">\n            &copy; 2026 Instalflow Platform. All rights reserved.\n        </div>\n    </div>\n</body>\n</html>\n";
},"useData":true});

export default templates;
