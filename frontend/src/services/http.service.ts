import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
  HttpResponse,
} from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { plainToInstance } from "class-transformer";
import { catchError, map, Observable, pipe, throwError } from "rxjs";
import { BACKEND_API } from "src/consts/core";
import { AppConfig } from "src/models/app-config";
import {
  ClientClosedRequestError,
  DataError,
  InternalError,
  NetworkError,
  NotFoundError,
  RequestTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
} from "src/models/errors";

const USER_TOKEN_HEADER = "user-token";

type BodyType = string | Object | Object[];

interface HttpOptions {
  headers?: { [key: string]: string };
  withCredentials?: boolean;
  responseType?: "json" | "text";
  params?: {
    [key: string]: number | string;
  };
}

function getRequestUrl(path: string) {
  return /^http/.test(path) ? path : [BACKEND_API, path].join("/");
}

@Injectable({ providedIn: "root" })
export class HttpService {
  constructor(
    private http: HttpClient,
    private config: AppConfig,
    private router: Router
  ) {}

  private processError({ status, error }: HttpErrorResponse): Error {
    const group = Math.floor(status / 100);
    switch (group) {
      case 0:
        return new NetworkError();
      case 4:
        if (status == 400) {
          const err =
            typeof error === "object"
              ? plainToInstance(DataError, error as Object)
              : new DataError(error);
          return err;
        } else if (status == 401) {
          this.config.authorization = null;
          this.router.navigate(["/"]);
          return new UnauthorizedError(error);
        } else if (status == 404) {
          return new NotFoundError(error);
        } else if (status == 413) {
          return new RequestTooLargeError(error);
        } else if (status == 429) {
          return new TooManyRequestsError(error);
        } else if (status == 499) {
          return new ClientClosedRequestError();
        }
        break;
      case 5:
        if (status == 500) {
          return new InternalError(error);
        } else {
          return new InternalError(
            "SERVICE_OFFLINE|Our service temporarily unavailable"
          );
        }
    }

    return new Error(error || `HTTP error with status code ${status}`);
  }

  private processResponse = () =>
    pipe(
      map((resp: HttpResponse<BodyType>) => resp.body as BodyType),
      catchError((httpError: any) => {
        if (httpError instanceof HttpErrorResponse) {
          const { status, error } = httpError;
          console.error("Process HTTP error", status, error);
          return throwError(() => this.processError(httpError));
        } else {
          console.error("Can't recognize error type", httpError);
          return throwError(() => httpError);
        }
      })
    );

  get(
    path: string,
    params: { [key: string]: number | string } = {},
    options?: HttpOptions
  ): Observable<BodyType> {
    return this.http
      .get<
        HttpResponse<BodyType>
      >(getRequestUrl(path), this.getRequestOptions({ params, ...options }))
      .pipe(this.processResponse());
  }

  post(
    path: string,
    data: {} | string | null = null,
    options?: HttpOptions
  ): Observable<BodyType> {
    return this.http
      .post<
        HttpResponse<BodyType>
      >(getRequestUrl(path), data, this.getRequestOptions(options, data))
      .pipe(this.processResponse());
  }

  patch(
    path: string,
    data: {} | FormData | string | null = null,
    options?: HttpOptions
  ): Observable<BodyType> {
    return this.http
      .patch<
        HttpResponse<BodyType>
      >(getRequestUrl(path), data, this.getRequestOptions(options, data))
      .pipe(this.processResponse());
  }

  put(
    path: string,
    data: {} | FormData | string | null = null,
    options?: HttpOptions
  ): Observable<BodyType> {
    return this.http
      .put<
        HttpResponse<BodyType>
      >(getRequestUrl(path), data, this.getRequestOptions(options, data))
      .pipe(this.processResponse());
  }

  delete(path: string, options?: HttpOptions): Observable<BodyType> {
    return this.http
      .delete<
        HttpResponse<BodyType>
      >(getRequestUrl(path), this.getRequestOptions(options))
      .pipe(this.processResponse());
  }

  getRequestOptions(
    { params, headers, responseType }: HttpOptions = {},
    data?: string | FormData | Object
  ) {
    const options = {
      // withCredentials: true,
      observe: "response" as const,
      // TODO: think better
      responseType: responseType as "json",
      headers: {
        ...headers,
        ...(() =>
          !!this.config.authorization
            ? { [USER_TOKEN_HEADER]: this.config.authorization.token }
            : {})(),
        ...(!!data
          ? (() => {
              if (typeof data == "string") {
                return {
                  contentType: "text/plain",
                };
              }
              if (data instanceof FormData) {
                return {};
              }
              return { contentType: "application/json" };
            })()
          : {}),
      },
      ...(() => {
        return !!params
          ? { params: new HttpParams({ fromObject: params }) }
          : {};
      })(),
    };

    return options;
  }
}
